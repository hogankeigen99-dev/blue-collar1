"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession, requireRole } from "@/lib/session";

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
  await requireSession();
  const jobId = str(formData, "jobId");
  const title = str(formData, "title");
  if (!jobId || !title) throw new Error("Job and title are required");

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
  await requireRole("ADMIN", "PM");
  const id = str(formData, "id");
  const jobId = str(formData, "jobId");
  const status = str(formData, "status");
  if (!id || !jobId || !status) throw new Error("Change order, job, and status are required");

  await prisma.changeOrder.update({
    where: { id },
    data: {
      status: status as never,
      revenueAmount: num(formData, "revenueAmount"),
      costAmount: num(formData, "costAmount"),
      approvedAt: status === "APPROVED" ? new Date() : status === "REJECTED" ? null : undefined,
    },
  });

  revalidatePath(`/jobs/${jobId}/change-orders`);
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}/change-orders`);
}
