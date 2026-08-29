"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { generateChecklistForStage } from "@/lib/checklist";
import { recordBenchmarksForCompletedJob } from "@/lib/productivity-benchmarks";
import { logAudit } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";

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

export async function updateJobCommandCenter(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const jobId = str(formData, "jobId");
  if (!jobId) throw new Error("Job is required");

  const targetStart = str(formData, "targetStartDate");
  const targetEnd = str(formData, "targetEndDate");
  const newStage = str(formData, "stage");
  const divisionId = str(formData, "divisionId");
  const projectType = str(formData, "projectType");

  const before = await prisma.job.findFirstOrThrow({ where: { id: jobId }, select: { stage: true, contractValue: true } });

  if (divisionId) {
    // Division is a tenant model but the id is client-supplied — verify it
    // belongs to this company before assigning the job to it.
    await prisma.division.findFirstOrThrow({ where: { id: divisionId } });
  }

  const newContractValue = num(formData, "contractValue") ?? null;

  await prisma.job.update({
    where: { id: jobId },
    data: {
      contractValue: newContractValue,
      pmUserId: str(formData, "pmUserId") ?? null,
      foremanWorkerId: str(formData, "foremanWorkerId") ?? null,
      divisionId: divisionId ?? null,
      targetStartDate: targetStart ? new Date(targetStart) : null,
      targetEndDate: targetEnd ? new Date(targetEnd) : null,
      stage: (newStage as never) ?? undefined,
      punchListComplete: formData.get("punchListComplete") === "on",
      requiredDocsComplete: formData.get("requiredDocsComplete") === "on",
      projectType: projectType ?? null,
    },
  });

  if (newContractValue !== before.contractValue) {
    await logAudit(session, {
      action: "job.contract_value_changed",
      entityType: "Job",
      entityId: jobId,
      jobId,
      detail: `${before.contractValue ?? 0} -> ${newContractValue ?? 0}`,
    });
  }

  // Automation: entering a new stage generates that stage's checklist.
  if (newStage && newStage !== before.stage) {
    await generateChecklistForStage(prisma, jobId, newStage);
    await logAudit(session, {
      action: "job.stage_changed",
      entityType: "Job",
      entityId: jobId,
      jobId,
      detail: `${before.stage} -> ${newStage}`,
    });
    await dispatchWebhook(session.companyId, "JOB_STAGE_CHANGED", { jobId, from: before.stage, to: newStage });
  }

  // Automation: a job at COMPLETE snapshots its finished cost-code lines
  // into the estimating history — unconditional on the resulting stage
  // (not just the transition into it) so re-saving an already-complete job
  // still reconciles the benchmark if its numbers changed since.
  if (newStage === "COMPLETE") {
    await recordBenchmarksForCompletedJob(prisma, jobId);
  }

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function setJobBudget(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const jobId = str(formData, "jobId");
  const category = str(formData, "category");
  const estimatedAmount = num(formData, "estimatedAmount");
  if (!jobId || !category || estimatedAmount === undefined) {
    throw new Error("Job, category, and estimated amount are required");
  }

  // JobBudget is a child of Job (no companyId of its own) and this is an
  // upsert, which scopedPrisma() deliberately leaves unscoped — so the job
  // must be verified to belong to this company before writing against it.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });

  await prisma.jobBudget.upsert({
    where: { jobId_category: { jobId, category: category as never } },
    update: { estimatedAmount },
    create: { jobId, category: category as never, estimatedAmount },
  });
  await logAudit(session, {
    action: "job_budget.set",
    entityType: "JobBudget",
    entityId: `${jobId}:${category}`,
    jobId,
    detail: `${category} estimated ${estimatedAmount}`,
  });

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}
