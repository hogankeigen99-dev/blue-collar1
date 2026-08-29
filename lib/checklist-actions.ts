"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, requireSession } from "@/lib/session";

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

export async function toggleChecklistItem(formData: FormData) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const id = str(formData, "id");
  const jobId = str(formData, "jobId");
  const doneById = str(formData, "doneById");
  const done = formData.get("done") === "on";
  if (!id || !jobId) throw new Error("Item and job are required");

  // JobChecklistItem isn't a tenant model — verify the job belongs to this
  // company, then that the checklist item belongs to that job, before updating.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });
  const item = await prisma.jobChecklistItem.findFirst({ where: { id, jobId } });
  if (!item) throw new Error("Checklist item not found");

  await prisma.jobChecklistItem.update({
    where: { id },
    data: { done, doneAt: done ? new Date() : null, doneById: done ? doneById : null },
  });

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function addChecklistItem(formData: FormData) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const jobId = str(formData, "jobId");
  const stage = str(formData, "stage");
  const title = str(formData, "title");
  if (!jobId || !stage || !title) throw new Error("Job, stage, and title are required");

  // JobChecklistItem is a child of Job (no companyId of its own) — verify
  // the job belongs to this company before creating against it.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });

  await prisma.jobChecklistItem.create({
    data: { jobId, stage: stage as never, title, source: "MANUAL" },
  });

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function createChecklistTemplateItem(formData: FormData) {
  const session = await requireRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);
  const stage = str(formData, "stage");
  const title = str(formData, "title");
  if (!stage || !title) throw new Error("Stage and title are required");

  await prisma.checklistTemplateItem.create({
    data: { companyId: session.companyId, stage: stage as never, title, sortOrder: num(formData, "sortOrder") ?? 0 },
  });

  revalidatePath("/settings/checklist-templates");
  redirect("/settings/checklist-templates");
}

export async function deleteChecklistTemplateItem(formData: FormData) {
  const session = await requireRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);
  const id = str(formData, "id");
  if (!id) throw new Error("Template item is required");

  await prisma.checklistTemplateItem.delete({ where: { id } });

  revalidatePath("/settings/checklist-templates");
  redirect("/settings/checklist-templates");
}
