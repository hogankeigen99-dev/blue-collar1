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

export async function createEquipment(formData: FormData) {
  await requireRole("ADMIN", "PM");
  const name = str(formData, "name");
  const ownership = str(formData, "ownership");
  if (!name || !ownership) throw new Error("Name and ownership are required");

  await prisma.equipment.create({
    data: {
      name,
      type: str(formData, "type"),
      ownership: ownership as never,
      dailyRentalCost: num(formData, "dailyRentalCost"),
    },
  });

  revalidatePath("/equipment");
  redirect("/equipment");
}

/** Assigns equipment to a job for a planned date range. Overlapping assignments for the
 * same equipment are still allowed (a dispatcher may need to override) but are flagged
 * back to the user via a query-string warning rather than silently allowed. */
export async function assignEquipment(formData: FormData) {
  await requireRole("ADMIN", "PM");
  const equipmentId = str(formData, "equipmentId");
  const jobId = str(formData, "jobId");
  const startRaw = str(formData, "startDate");
  const endRaw = str(formData, "endDate");
  if (!equipmentId || !jobId || !startRaw || !endRaw) {
    throw new Error("Equipment, job, start date, and end date are required");
  }

  const startDate = new Date(startRaw);
  const endDate = new Date(endRaw);

  const overlapping = await prisma.equipmentAssignment.findMany({
    where: {
      equipmentId,
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    include: { job: { select: { title: true } } },
  });

  await prisma.equipmentAssignment.create({
    data: { equipmentId, jobId, startDate, endDate },
  });

  revalidatePath("/equipment");
  revalidatePath(`/jobs/${jobId}`);

  if (overlapping.length > 0) {
    const conflictJobs = overlapping.map((o) => o.job.title).join(", ");
    redirect(`/equipment?conflict=${encodeURIComponent(conflictJobs)}`);
  }
  redirect("/equipment");
}

export async function updateEquipmentAssignment(formData: FormData) {
  await requireRole("ADMIN", "PM");
  const id = str(formData, "id");
  if (!id) throw new Error("Assignment is required");

  const pickupRaw = str(formData, "actualPickupDate");
  const returnRaw = str(formData, "actualReturnDate");

  await prisma.equipmentAssignment.update({
    where: { id },
    data: {
      actualPickupDate: pickupRaw ? new Date(pickupRaw) : undefined,
      actualReturnDate: returnRaw ? new Date(returnRaw) : undefined,
      downtimeNotes: str(formData, "downtimeNotes"),
    },
  });

  revalidatePath("/equipment");
  redirect("/equipment");
}
