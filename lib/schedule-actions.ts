"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { parseDateKey, dateKey, addDays } from "@/lib/schedule";
import { logAudit } from "@/lib/audit";
import { demoReturnTo } from "@/lib/demo-redirect";

/** Assigns a worker to a job for one day, or a range through `throughDate`. Collects
 * non-blocking warnings (marked-unavailable days, displacing an existing different-job
 * assignment) and surfaces them back on the schedule page rather than silently allowing
 * or hard-blocking the change — a dispatcher may have a legitimate reason to override. */
export async function setScheduleAssignment(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);

  const workerId = String(formData.get("workerId") ?? "");
  const dateKeyValue = String(formData.get("date") ?? "");
  const throughDateValue = String(formData.get("throughDate") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const week = String(formData.get("week") ?? "");
  if (!workerId || !dateKeyValue) throw new Error("Worker and date are required");

  // ScheduleAssignment is a child of Worker/Job (no companyId of its own)
  // and this uses upsert (left unscoped by design) — verify the worker,
  // and the job if given, belong to this company before writing.
  await prisma.worker.findFirstOrThrow({ where: { id: workerId } });

  const startDate = parseDateKey(dateKeyValue);
  const endDate = throughDateValue ? parseDateKey(throughDateValue) : startDate;

  const dates: Date[] = [];
  for (let d = startDate; d.getTime() <= endDate.getTime(); d = addDays(d, 1)) {
    dates.push(d);
  }

  const warnings: string[] = [];

  if (jobId) {
    const [job, unavailableDays, existingAssignments] = await Promise.all([
      prisma.job.findFirst({ where: { id: jobId }, select: { title: true } }),
      prisma.workerUnavailability.findMany({
        where: { workerId, date: { in: dates } },
      }),
      prisma.scheduleAssignment.findMany({
        where: { workerId, date: { in: dates }, NOT: { jobId } },
        include: { job: { select: { title: true } } },
      }),
    ]);
    if (!job) throw new Error("Job not found");

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

/** Staffs a crew onto an already-awarded job — the one real gap the
 * consolidated Award flow (lib/award-actions.ts) doesn't cover: a job
 * awarded without its crew picked yet (a common real sequence — the
 * estimator/PM confirms scope and price before staffing is finalized)
 * previously had no way to add crew afterward at all. Creates both the
 * formal JobAssignment (crew membership) and day-by-day ScheduleAssignment
 * rows together, same as Award does, so this never produces the
 * CREW_CONFLICT alert's "scheduled but not formally assigned" gap. */
export async function assignCrewToJob(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);

  const jobId = String(formData.get("jobId") ?? "");
  const workerIds = formData.getAll("workerIds").filter((v): v is string => typeof v === "string" && v.length > 0);
  const startDateRaw = String(formData.get("startDate") ?? "");
  const endDateRaw = String(formData.get("endDate") ?? "");
  if (!jobId || workerIds.length === 0 || !startDateRaw) {
    throw new Error("Job, at least one worker, and a start date are required");
  }

  const job = await prisma.job.findFirstOrThrow({ where: { id: jobId } });
  await prisma.worker.findMany({ where: { id: { in: workerIds } } }).then((found) => {
    if (found.length !== workerIds.length) throw new Error("One or more workers not found");
  });

  const startDate = parseDateKey(startDateRaw);
  const endDate = endDateRaw ? parseDateKey(endDateRaw) : startDate;
  const dates: Date[] = [];
  for (let d = startDate; d.getTime() <= endDate.getTime(); d = addDays(d, 1)) {
    dates.push(d);
  }

  await prisma.jobAssignment.createMany({
    data: workerIds.map((workerId) => ({ jobId, workerId })),
    skipDuplicates: true,
  });
  await prisma.scheduleAssignment.createMany({
    data: workerIds.flatMap((workerId) => dates.map((date) => ({ workerId, jobId, date }))),
    skipDuplicates: true,
  });

  await logAudit(session, {
    action: "job.crew_assigned",
    entityType: "Job",
    entityId: jobId,
    jobId,
    detail: `${workerIds.length} worker(s) staffed, ${dateKey(startDate)} through ${dateKey(endDate)}`,
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/demo/small-project");
  redirect(demoReturnTo(formData, `/jobs/${job.id}`));
}
