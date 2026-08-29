"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export async function markWorkerUnavailable(formData: FormData) {
  await requireRole("ADMIN", "PM");
  const workerId = str(formData, "workerId");
  const date = str(formData, "date");
  if (!workerId || !date) throw new Error("Worker and date are required");

  await prisma.workerUnavailability.upsert({
    where: { workerId_date: { workerId, date: new Date(date) } },
    update: { reason: str(formData, "reason") },
    create: { workerId, date: new Date(date), reason: str(formData, "reason") },
  });

  revalidatePath(`/workers/${workerId}`);
  redirect(`/workers/${workerId}`);
}

export async function removeWorkerUnavailability(formData: FormData) {
  await requireRole("ADMIN", "PM");
  const id = str(formData, "id");
  const workerId = str(formData, "workerId");
  if (!id || !workerId) throw new Error("Unavailability entry and worker are required");

  await prisma.workerUnavailability.delete({ where: { id } });

  revalidatePath(`/workers/${workerId}`);
  redirect(`/workers/${workerId}`);
}
