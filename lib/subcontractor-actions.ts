"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";

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

export async function createSubcontractorCost(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const jobId = str(formData, "jobId");
  const vendor = str(formData, "vendor");
  const committedAmount = num(formData, "committedAmount");
  if (!jobId || !vendor || committedAmount === undefined) {
    throw new Error("Job, vendor, and committed amount are required");
  }

  // SubcontractorCost is a child of Job (no companyId of its own) — verify
  // the job belongs to this company before creating against it.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });

  const cost = await prisma.subcontractorCost.create({
    data: { jobId, vendor, committedAmount, description: str(formData, "description") },
  });
  await logAudit(session, {
    action: "subcontractor_cost.created",
    entityType: "SubcontractorCost",
    entityId: cost.id,
    jobId,
    detail: `${vendor} — committed ${committedAmount}`,
  });

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function updateSubcontractorCost(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const id = str(formData, "id");
  const jobId = str(formData, "jobId");
  const status = str(formData, "status");
  if (!id || !jobId || !status) throw new Error("Cost, job, and status are required");

  // SubcontractorCost isn't a tenant model — verify the job belongs to this
  // company, then that the cost belongs to that job, before updating it.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });
  const existing = await prisma.subcontractorCost.findFirst({ where: { id, jobId } });
  if (!existing) throw new Error("Subcontractor cost not found");

  const actualAmount = num(formData, "actualAmount");
  await prisma.subcontractorCost.update({
    where: { id },
    data: { status: status as never, actualAmount },
  });
  if (status === "INVOICED" || status === "PAID") {
    await logAudit(session, {
      action: status === "PAID" ? "subcontractor_cost.paid" : "subcontractor_cost.invoiced",
      entityType: "SubcontractorCost",
      entityId: id,
      jobId,
      detail: `${existing.vendor} — actual ${actualAmount ?? existing.actualAmount}`,
    });
  }

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}
