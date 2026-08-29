"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB per photo — Postgres-blob storage isn't meant for much more than this

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

/** One report per job per day — submitting again for the same date updates it in place. */
export async function submitDailyReport(formData: FormData) {
  const session = await requireSession(); // the foreman's core field workflow — any signed-in role
  const prisma = scopedPrisma(session.companyId);
  const jobId = str(formData, "jobId");
  const dateRaw = str(formData, "date");
  if (!jobId || !dateRaw) throw new Error("Job and date are required");

  // DailyReport is a child of Job and this is an upsert (left unscoped by
  // design) — verify the job belongs to this company before writing.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });

  const date = new Date(dateRaw);
  const hasChangeCondition = formData.get("hasChangeCondition") === "on";

  const report = await prisma.dailyReport.upsert({
    where: { jobId_date: { jobId, date } },
    update: {
      crewSize: num(formData, "crewSize"),
      hours: num(formData, "hours"),
      quantityInstalled: str(formData, "quantityInstalled"),
      workCompleted: str(formData, "workCompleted"),
      blockers: str(formData, "blockers"),
      materialNeeded: str(formData, "materialNeeded"),
      equipmentIssue: str(formData, "equipmentIssue"),
      safetyIssue: str(formData, "safetyIssue"),
      hasChangeCondition,
      changeConditionNotes: hasChangeCondition ? str(formData, "changeConditionNotes") : undefined,
      delayReason: str(formData, "delayReason"),
      tomorrowPlan: str(formData, "tomorrowPlan"),
      submittedById: str(formData, "submittedById"),
    },
    create: {
      jobId,
      date,
      crewSize: num(formData, "crewSize"),
      hours: num(formData, "hours"),
      quantityInstalled: str(formData, "quantityInstalled"),
      workCompleted: str(formData, "workCompleted"),
      blockers: str(formData, "blockers"),
      materialNeeded: str(formData, "materialNeeded"),
      equipmentIssue: str(formData, "equipmentIssue"),
      safetyIssue: str(formData, "safetyIssue"),
      hasChangeCondition,
      changeConditionNotes: hasChangeCondition ? str(formData, "changeConditionNotes") : undefined,
      delayReason: str(formData, "delayReason"),
      tomorrowPlan: str(formData, "tomorrowPlan"),
      submittedById: str(formData, "submittedById"),
    },
  });

  const photos = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  for (const photo of photos) {
    if (photo.size > MAX_PHOTO_BYTES) continue; // skip oversized files rather than fail the whole report
    const buffer = Buffer.from(await photo.arrayBuffer());
    await prisma.dailyReportPhoto.create({
      data: {
        dailyReportId: report.id,
        data: buffer,
        contentType: photo.type || "application/octet-stream",
      },
    });
  }

  await logAudit(session, {
    action: "daily_report.submitted",
    entityType: "DailyReport",
    entityId: report.id,
    jobId,
    detail: dateRaw,
  });
  await dispatchWebhook(session.companyId, "DAILY_REPORT_SUBMITTED", { jobId, reportId: report.id, date: dateRaw });

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function deleteDailyReportPhoto(photoId: string, jobId: string) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  // DailyReportPhoto is a child of DailyReport/Job — confirm the job (and
  // therefore the photo's report) belongs to this company before deleting.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });
  const photo = await prisma.dailyReportPhoto.findFirst({
    where: { id: photoId, dailyReport: { jobId } },
  });
  if (!photo) throw new Error("Photo not found");
  await prisma.dailyReportPhoto.delete({ where: { id: photoId } });
  revalidatePath(`/jobs/${jobId}`);
}
