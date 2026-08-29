"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";

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
  await requireRole("ADMIN", "PM");
  const jobId = str(formData, "jobId");
  const vendor = str(formData, "vendor");
  const committedAmount = num(formData, "committedAmount");
  if (!jobId || !vendor || committedAmount === undefined) {
    throw new Error("Job, vendor, and committed amount are required");
  }

  await prisma.subcontractorCost.create({
    data: { jobId, vendor, committedAmount, description: str(formData, "description") },
  });

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function updateSubcontractorCost(formData: FormData) {
  await requireRole("ADMIN", "PM");
  const id = str(formData, "id");
  const jobId = str(formData, "jobId");
  const status = str(formData, "status");
  if (!id || !jobId || !status) throw new Error("Cost, job, and status are required");

  await prisma.subcontractorCost.update({
    where: { id },
    data: { status: status as never, actualAmount: num(formData, "actualAmount") },
  });

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}
