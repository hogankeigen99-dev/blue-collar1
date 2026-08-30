"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { resolveOrCreateVendorId } from "@/lib/vendors";
import { formatMoney } from "@/lib/format";

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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function createSubcontract(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const jobId = str(formData, "jobId");
  const committedAmount = num(formData, "committedAmount");
  if (!jobId || committedAmount === undefined) {
    throw new Error("Job and committed amount are required");
  }

  // Subcontract is a child of Job (no companyId of its own) — verify the
  // job belongs to this company before creating against it.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });

  const vendorId = await resolveOrCreateVendorId(prisma, session.companyId, str(formData, "vendorId"), str(formData, "newVendorName"));
  const agreementStatus = (str(formData, "agreementStatus") as "DRAFT" | "EXECUTED" | undefined) ?? "DRAFT";
  const coiExpirationRaw = str(formData, "coiExpirationDate");

  const sub = await prisma.subcontract.create({
    data: {
      jobId,
      vendorId,
      description: str(formData, "description"),
      committedAmount,
      retainagePct: num(formData, "retainagePct"),
      coiExpirationDate: coiExpirationRaw ? new Date(coiExpirationRaw) : undefined,
      agreementStatus,
      executedDate: agreementStatus === "EXECUTED" ? new Date() : undefined,
    },
  });
  await logAudit(session, {
    action: "subcontract.created",
    entityType: "Subcontract",
    entityId: sub.id,
    jobId,
    detail: `committed ${committedAmount}`,
  });

  revalidatePath(`/jobs/${jobId}/subcontracts`);
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}/subcontracts`);
}

export async function updateSubcontract(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const id = str(formData, "id");
  const jobId = str(formData, "jobId");
  if (!id || !jobId) throw new Error("Subcontract and job are required");

  // Subcontract isn't a tenant model — verify the job belongs to this
  // company, then that the subcontract belongs to that job, before updating.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });
  const existing = await prisma.subcontract.findFirst({ where: { id, jobId } });
  if (!existing) throw new Error("Subcontract not found");

  const status = str(formData, "status") as never;
  const agreementStatus = str(formData, "agreementStatus") as "DRAFT" | "EXECUTED" | "CLOSED" | undefined;
  const actualAmount = num(formData, "actualAmount");
  const coiExpirationRaw = str(formData, "coiExpirationDate");

  const updated = await prisma.subcontract.update({
    where: { id },
    data: {
      status,
      actualAmount,
      agreementStatus,
      // Executing it for the first time records when, automatically —
      // never asked for as a separate typed field.
      executedDate: agreementStatus === "EXECUTED" && !existing.executedDate ? new Date() : undefined,
      coiExpirationDate: coiExpirationRaw ? new Date(coiExpirationRaw) : undefined,
    },
  });

  if (status === "INVOICED" || status === "PAID") {
    await logAudit(session, {
      action: status === "PAID" ? "subcontract.paid" : "subcontract.invoiced",
      entityType: "Subcontract",
      entityId: id,
      jobId,
      detail: `actual ${actualAmount ?? existing.actualAmount}`,
    });
  }
  if (agreementStatus === "EXECUTED" && existing.agreementStatus !== "EXECUTED") {
    await logAudit(session, {
      action: "subcontract.executed",
      entityType: "Subcontract",
      entityId: id,
      jobId,
      detail: `committed ${updated.committedAmount}`,
    });
  }

  revalidatePath(`/jobs/${jobId}/subcontracts`);
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}/subcontracts`);
}

/**
 * Retainage release, AP side — paying a sub out the retainage withheld on
 * work they've already completed and been paid for. A subcontract has no
 * SOV/InvoiceLine history to net a release against the way Contract billing
 * does (lib/invoice-actions.ts's releaseRetainage), so this needs its own
 * timestamp: once set, lib/cash.ts's getRetainageSummary stops counting this
 * subcontract's retainagePct as still held.
 */
export async function releaseSubcontractRetainage(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const id = str(formData, "id");
  const jobId = str(formData, "jobId");
  if (!id || !jobId) throw new Error("Subcontract and job are required");

  // Subcontract isn't a tenant model — verify the job belongs to this
  // company, then that the subcontract belongs to that job, before updating.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });
  const existing = await prisma.subcontract.findFirst({ where: { id, jobId } });
  if (!existing) throw new Error("Subcontract not found");
  if (!existing.retainagePct || existing.retainagePct <= 0) {
    throw new Error("This subcontract has no retainage withheld.");
  }
  if (existing.status !== "PAID") {
    throw new Error("Retainage can only be released once the subcontract is fully paid.");
  }
  if (existing.retainageReleasedAt) {
    throw new Error("Retainage has already been released for this subcontract.");
  }

  await prisma.subcontract.update({ where: { id }, data: { retainageReleasedAt: new Date() } });

  const releasedAmount = round2(existing.actualAmount * (existing.retainagePct / 100));
  await logAudit(session, {
    action: "subcontract.retainage_released",
    entityType: "Subcontract",
    entityId: id,
    jobId,
    detail: `${formatMoney(releasedAmount)} released`,
  });

  revalidatePath(`/jobs/${jobId}/subcontracts`);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/cash");
  redirect(`/jobs/${jobId}/subcontracts`);
}
