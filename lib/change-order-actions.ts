"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession, requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";
import { ensureContract } from "@/lib/contract";
import { demoReturnTo } from "@/lib/demo-redirect";

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function num(formData: FormData, key: string): number | undefined {
  const v = str(formData, key);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Field identifies extra work — any signed-in role, so it gets captured before it's forgotten. */
export async function createChangeOrder(formData: FormData) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const jobId = str(formData, "jobId");
  const title = str(formData, "title");
  if (!jobId || !title) throw new Error("Job and title are required");

  // ChangeOrder is a child of Job (no companyId of its own) — verify the
  // job belongs to this company before creating against it.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });

  await prisma.changeOrder.create({
    data: {
      jobId,
      title,
      description: str(formData, "description"),
      sourceDailyReportId: str(formData, "sourceDailyReportId"),
      createdById: str(formData, "createdById"),
    },
  });

  revalidatePath(`/jobs/${jobId}/change-orders`);
  redirect(`/jobs/${jobId}/change-orders`);
}

/** PM prices it and moves it through submitted/approved/rejected — PM/ADMIN only. */
export async function updateChangeOrder(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const id = str(formData, "id");
  const jobId = str(formData, "jobId");
  const status = str(formData, "status");
  if (!id || !jobId || !status) throw new Error("Change order, job, and status are required");

  // ChangeOrder isn't a tenant model, so `where: { id }` alone can't be
  // scoped by the extension — verify the job belongs to this company, then
  // that the change order belongs to that job, before updating it.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });
  const existing = await prisma.changeOrder.findFirst({ where: { id, jobId } });
  if (!existing) throw new Error("Change order not found");

  const co = await prisma.changeOrder.update({
    where: { id },
    data: {
      status: status as never,
      revenueAmount: num(formData, "revenueAmount"),
      costAmount: num(formData, "costAmount"),
      approvedAt: status === "APPROVED" ? new Date() : status === "REJECTED" ? null : undefined,
    },
  });

  // Keep the Schedule of Values in sync with approved change work — a CO's
  // revenue becomes billable to the owner the moment it's approved, and
  // stops being billable (line removed) the moment it's un-approved, as
  // long as nothing has been billed against it yet.
  const existingLine = await prisma.contractLine.findUnique({
    where: { sourceChangeOrderId: id },
    include: { invoiceLines: true },
  });
  if (status === "APPROVED" && co.revenueAmount) {
    const contract = await ensureContract(prisma, jobId);
    await prisma.contractLine.upsert({
      where: { sourceChangeOrderId: id },
      create: {
        contractId: contract.id,
        description: `CO: ${co.title}`,
        scheduledValue: co.revenueAmount,
        sourceChangeOrderId: id,
      },
      update: { scheduledValue: co.revenueAmount, description: `CO: ${co.title}` },
    });
  } else if (existingLine && existingLine.invoiceLines.length === 0) {
    await prisma.contractLine.delete({ where: { id: existingLine.id } });
  }

  if (status === "APPROVED") {
    await logAudit(session, {
      action: "change_order.approved",
      entityType: "ChangeOrder",
      entityId: id,
      jobId,
      detail: `"${co.title}" — revenue ${co.revenueAmount ?? 0}, cost ${co.costAmount ?? 0}`,
    });
    await dispatchWebhook(session.companyId, "CHANGE_ORDER_APPROVED", {
      jobId,
      changeOrderId: id,
      title: co.title,
      revenueAmount: co.revenueAmount,
      costAmount: co.costAmount,
    });
  } else if (status === "REJECTED") {
    await logAudit(session, {
      action: "change_order.rejected",
      entityType: "ChangeOrder",
      entityId: id,
      jobId,
      detail: `"${co.title}"`,
    });
  }

  revalidatePath(`/jobs/${jobId}/change-orders`);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/demo/small-project");
  redirect(demoReturnTo(formData, `/jobs/${jobId}/change-orders`));
}
