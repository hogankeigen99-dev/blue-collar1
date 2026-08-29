import type { ProjectStage } from "@prisma/client";

// Hand-written rather than derived from the generated Prisma types: a
// scopedPrisma()-extended client's generic instantiation differs from a
// plain PrismaClient/TransactionClient just enough that TS won't treat them
// as structurally assignable, even though the runtime API is identical. A
// minimal shape sidesteps that friction instead of fighting the generics.
type ChecklistClient = {
  jobChecklistItem: {
    findFirst(args: {
      where: { jobId: string; stage: ProjectStage; source: string };
    }): Promise<{ id: string } | null>;
    createMany(args: {
      data: { jobId: string; stage: ProjectStage; title: string; source: string }[];
    }): Promise<unknown>;
  };
  checklistTemplateItem: {
    findMany(args: {
      where: { stage: ProjectStage };
      orderBy: { sortOrder: "asc" };
    }): Promise<{ title: string; sortOrder: number }[]>;
  };
};

/**
 * The automation engine's core trigger: generates a job's checklist items for
 * a stage from the company-wide template, the moment the job enters that
 * stage (on creation for PRECON, on every stage change after that). Idempotent
 * per job+stage — re-entering a stage (e.g. reopened punch list) regenerates
 * only if nothing was ever generated for that stage on this job before.
 */
export async function generateChecklistForStage(
  tx: ChecklistClient,
  jobId: string,
  stage: string
) {
  const alreadyGenerated = await tx.jobChecklistItem.findFirst({
    where: { jobId, stage: stage as ProjectStage, source: "AUTOMATED" },
  });
  if (alreadyGenerated) return;

  const template = await tx.checklistTemplateItem.findMany({
    where: { stage: stage as ProjectStage },
    orderBy: { sortOrder: "asc" },
  });
  if (template.length === 0) return;

  await tx.jobChecklistItem.createMany({
    data: template.map((t) => ({
      jobId,
      stage: stage as ProjectStage,
      title: t.title,
      source: "AUTOMATED",
    })),
  });
}
