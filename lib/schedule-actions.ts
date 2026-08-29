"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { parseDateKey } from "@/lib/schedule";

export async function setScheduleAssignment(formData: FormData) {
  await requireRole("ADMIN", "PM");

  const workerId = String(formData.get("workerId") ?? "");
  const dateKeyValue = String(formData.get("date") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const week = String(formData.get("week") ?? "");
  if (!workerId || !dateKeyValue) throw new Error("Worker and date are required");

  const date = parseDateKey(dateKeyValue);

  if (jobId) {
    await prisma.scheduleAssignment.upsert({
      where: { workerId_date: { workerId, date } },
      update: { jobId },
      create: { workerId, jobId, date },
    });
  } else {
    await prisma.scheduleAssignment.deleteMany({ where: { workerId, date } });
  }

  revalidatePath("/schedule");
  redirect(week ? `/schedule?week=${week}` : "/schedule");
}
