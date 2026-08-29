import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * The automation engine's core trigger: generates a job's checklist items for
 * a stage from the company-wide template, the moment the job enters that
 * stage (on creation for PRECON, on every stage change after that). Idempotent
 * per job+stage — re-entering a stage (e.g. reopened punch list) regenerates
 * only if nothing was ever generated for that stage on this job before.
 */
export async function generateChecklistForStage(
  tx: Prisma.TransactionClient | typeof prisma,
  jobId: string,
  stage: string
) {
  const alreadyGenerated = await tx.jobChecklistItem.findFirst({
    where: { jobId, stage: stage as never, source: "AUTOMATED" },
  });
  if (alreadyGenerated) return;

  const template = await tx.checklistTemplateItem.findMany({
    where: { stage: stage as never },
    orderBy: { sortOrder: "asc" },
  });
  if (template.length === 0) return;

  await tx.jobChecklistItem.createMany({
    data: template.map((t) => ({
      jobId,
      stage: stage as never,
      title: t.title,
      source: "AUTOMATED",
    })),
  });
}
