"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession, requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10MB — Postgres-blob storage isn't meant for much more than this

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

/** Any signed-in role can upload — a foreman attaching a safety doc or field photo shouldn't need a PM. */
export async function uploadDocument(formData: FormData) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const jobId = str(formData, "jobId");
  const category = str(formData, "category");
  const file = formData.get("file");
  if (!jobId || !category || !(file instanceof File) || file.size === 0) {
    throw new Error("Job, category, and a file are required");
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error("File is too large (10MB max)");
  }

  // Document is a child of Job (no companyId of its own) — verify the job
  // belongs to this company before creating against it.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });

  const title = str(formData, "title") ?? file.name;
  const buffer = Buffer.from(await file.arrayBuffer());

  await prisma.document.create({
    data: {
      jobId,
      category: category as never,
      title,
      data: buffer,
      contentType: file.type || "application/octet-stream",
      fileSize: file.size,
      uploadedById: str(formData, "uploadedById"),
    },
  });

  revalidatePath(`/jobs/${jobId}/documents`);
  redirect(`/jobs/${jobId}/documents`);
}

export async function deleteDocument(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const id = str(formData, "id");
  const jobId = str(formData, "jobId");
  if (!id || !jobId) throw new Error("Document and job are required");

  // Document isn't a tenant model — verify the job belongs to this company,
  // then that the document belongs to that job, before deleting it.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });
  const existing = await prisma.document.findFirst({ where: { id, jobId } });
  if (!existing) throw new Error("Document not found");

  await prisma.document.delete({ where: { id } });
  await logAudit(session, {
    action: "document.deleted",
    entityType: "Document",
    entityId: id,
    jobId,
    detail: existing.title,
  });

  revalidatePath(`/jobs/${jobId}/documents`);
  redirect(`/jobs/${jobId}/documents`);
}
