"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export async function markWorkerUnavailable(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const workerId = str(formData, "workerId");
  const date = str(formData, "date");
  if (!workerId || !date) throw new Error("Worker and date are required");

  // WorkerUnavailability is a child of Worker (no companyId of its own)
  // and this is an upsert (left unscoped by design) — verify the worker
  // belongs to this company before writing against it.
  await prisma.worker.findFirstOrThrow({ where: { id: workerId } });

  await prisma.workerUnavailability.upsert({
    where: { workerId_date: { workerId, date: new Date(date) } },
    update: { reason: str(formData, "reason") },
    create: { workerId, date: new Date(date), reason: str(formData, "reason") },
  });

  revalidatePath(`/workers/${workerId}`);
  redirect(`/workers/${workerId}`);
}

export async function removeWorkerUnavailability(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const id = str(formData, "id");
  const workerId = str(formData, "workerId");
  if (!id || !workerId) throw new Error("Unavailability entry and worker are required");

  // WorkerUnavailability isn't a tenant model — verify the worker belongs
  // to this company, then that the entry belongs to that worker.
  await prisma.worker.findFirstOrThrow({ where: { id: workerId } });
  const existing = await prisma.workerUnavailability.findFirst({ where: { id, workerId } });
  if (!existing) throw new Error("Unavailability entry not found");

  await prisma.workerUnavailability.delete({ where: { id } });

  revalidatePath(`/workers/${workerId}`);
  redirect(`/workers/${workerId}`);
}
