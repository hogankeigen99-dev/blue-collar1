"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession, requireRole } from "@/lib/session";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10MB — Postgres-blob storage isn't meant for much more than this

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

/** Any signed-in role can upload — a foreman attaching a safety doc or field photo shouldn't need a PM. */
export async function uploadDocument(formData: FormData) {
  await requireSession();
  const jobId = str(formData, "jobId");
  const category = str(formData, "category");
  const file = formData.get("file");
  if (!jobId || !category || !(file instanceof File) || file.size === 0) {
    throw new Error("Job, category, and a file are required");
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error("File is too large (10MB max)");
  }

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
  await requireRole("ADMIN", "PM");
  const id = str(formData, "id");
  const jobId = str(formData, "jobId");
  if (!id || !jobId) throw new Error("Document and job are required");

  await prisma.document.delete({ where: { id } });

  revalidatePath(`/jobs/${jobId}/documents`);
  redirect(`/jobs/${jobId}/documents`);
}
