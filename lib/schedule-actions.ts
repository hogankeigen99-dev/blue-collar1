"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { parseDateKey, dateKey, addDays } from "@/lib/schedule";

/** Assigns a worker to a job for one day, or a range through `throughDate`. Collects
 * non-blocking warnings (marked-unavailable days, displacing an existing different-job
 * assignment) and surfaces them back on the schedule page rather than silently allowing
 * or hard-blocking the change — a dispatcher may have a legitimate reason to override. */
export async function setScheduleAssignment(formData: FormData) {
  await requireRole("ADMIN", "PM");

  const workerId = String(formData.get("workerId") ?? "");
  const dateKeyValue = String(formData.get("date") ?? "");
  const throughDateValue = String(formData.get("throughDate") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const week = String(formData.get("week") ?? "");
  if (!workerId || !dateKeyValue) throw new Error("Worker and date are required");

  const startDate = parseDateKey(dateKeyValue);
  const endDate = throughDateValue ? parseDateKey(throughDateValue) : startDate;

  const dates: Date[] = [];
  for (let d = startDate; d.getTime() <= endDate.getTime(); d = addDays(d, 1)) {
    dates.push(d);
  }

  const warnings: string[] = [];

  if (jobId) {
    const [job, unavailableDays, existingAssignments] = await Promise.all([
      prisma.job.findUnique({ where: { id: jobId }, select: { title: true } }),
      prisma.workerUnavailability.findMany({
        where: { workerId, date: { in: dates } },
      }),
      prisma.scheduleAssignment.findMany({
        where: { workerId, date: { in: dates }, NOT: { jobId } },
        include: { job: { select: { title: true } } },
      }),
    ]);

    for (const u of unavailableDays) {
      warnings.push(`marked unavailable on ${dateKey(u.date)}${u.reason ? ` (${u.reason})` : ""}`);
    }
    for (const a of existingAssignments) {
      warnings.push(`moved off "${a.job.title}" on ${dateKey(a.date)}`);
    }

    await Promise.all(
      dates.map((date) =>
        prisma.scheduleAssignment.upsert({
          where: { workerId_date: { workerId, date } },
          update: { jobId },
          create: { workerId, jobId, date },
        })
      )
    );

    if (job && dates.length > 1) {
      warnings.unshift(`assigned to "${job.title}" for ${dates.length} days`);
    }
  } else {
    await prisma.scheduleAssignment.deleteMany({ where: { workerId, date: { in: dates } } });
  }

  revalidatePath("/schedule");
  const params = new URLSearchParams();
  if (week) params.set("week", week);
  if (warnings.length > 0) params.set("warning", warnings.join("; "));
  const qs = params.toString();
  redirect(qs ? `/schedule?${qs}` : "/schedule");
}
