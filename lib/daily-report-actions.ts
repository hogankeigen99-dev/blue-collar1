"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";
import { demoReturnTo } from "@/lib/demo-redirect";

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

/**
 * One report per job per day — submitting again for the same date updates
 * it in place. This is the foreman's single stop for the day: labor/
 * production entered here writes straight to ProductionEntry (no separate
 * "log production" visit), a material need auto-opens a MaterialRequest for
 * the PM to process, and a flagged change condition auto-opens a pending
 * ChangeOrder — so job cost, productivity, procurement, and change
 * management all move off one submission instead of four.
 */
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
  const submittedById = str(formData, "submittedById");
  const crewSize = num(formData, "crewSize");
  const materialNeeded = str(formData, "materialNeeded");
  const changeConditionNotes = hasChangeCondition ? str(formData, "changeConditionNotes") : undefined;

  // --- Labor/production, one row per active cost code — the only place
  // hours and quantity installed are entered. Rows with no hours or
  // quantity are simply skipped (a rain day, or a code not worked today).
  const jobCostCodes = await prisma.jobCostCode.findMany({
    where: { jobId },
    include: { costCode: true },
  });
  const rowCostCodeIds = formData.getAll("rowJobCostCodeId").map(String);
  const rowHours = formData.getAll("rowHours").map(String);
  const rowQty = formData.getAll("rowQty").map(String);
  const jccById = new Map(jobCostCodes.map((j) => [j.id, j]));
  const productionRows = rowCostCodeIds
    .map((jobCostCodeId, i) => ({
      jcc: jccById.get(jobCostCodeId),
      hours: Number(rowHours[i]),
      quantity: Number(rowQty[i]),
    }))
    .filter(
      (r): r is { jcc: NonNullable<typeof r.jcc>; hours: number; quantity: number } =>
        r.jcc !== undefined && Number.isFinite(r.hours) && r.hours > 0 && Number.isFinite(r.quantity) && r.quantity >= 0
    );

  const totalHours = productionRows.reduce((s, r) => s + r.hours, 0);
  const quantitySummary = productionRows
    .map((r) => `${r.quantity} ${r.jcc.costCode.unit} ${r.jcc.costCode.description}`)
    .join("; ");

  const report = await prisma.dailyReport.upsert({
    where: { jobId_date: { jobId, date } },
    update: {
      crewSize,
      hours: totalHours || undefined,
      quantityInstalled: quantitySummary || undefined,
      workCompleted: str(formData, "workCompleted"),
      blockers: str(formData, "blockers"),
      materialNeeded,
      equipmentIssue: str(formData, "equipmentIssue"),
      safetyIssue: str(formData, "safetyIssue"),
      hasChangeCondition,
      changeConditionNotes: hasChangeCondition ? changeConditionNotes : undefined,
      delayReason: str(formData, "delayReason"),
      tomorrowPlan: str(formData, "tomorrowPlan"),
      submittedById,
    },
    create: {
      jobId,
      date,
      crewSize,
      hours: totalHours || undefined,
      quantityInstalled: quantitySummary || undefined,
      workCompleted: str(formData, "workCompleted"),
      blockers: str(formData, "blockers"),
      materialNeeded,
      equipmentIssue: str(formData, "equipmentIssue"),
      safetyIssue: str(formData, "safetyIssue"),
      hasChangeCondition,
      changeConditionNotes: hasChangeCondition ? changeConditionNotes : undefined,
      delayReason: str(formData, "delayReason"),
      tomorrowPlan: str(formData, "tomorrowPlan"),
      submittedById,
    },
  });

  // Replace this report's production entries wholesale — resubmitting the
  // same date (a correction) should leave exactly the rows just submitted,
  // not a stale mix of old and new.
  await prisma.productionEntry.deleteMany({ where: { dailyReportId: report.id } });
  if (productionRows.length > 0) {
    await prisma.productionEntry.createMany({
      data: productionRows.map((r) => ({
        jobCostCodeId: r.jcc.id,
        dailyReportId: report.id,
        date,
        hours: r.hours,
        quantity: r.quantity,
        crewSize,
        enteredById: submittedById,
      })),
    });
  }

  // --- Material needed -> a real MaterialRequest the PM can act on,
  // instead of a note the PM has to notice and re-key. Resubmitting the
  // same report updates its own auto-opened request rather than opening a
  // second one for the same need.
  if (materialNeeded) {
    const existingRequest = await prisma.materialRequest.findFirst({
      where: { jobId, sourceDailyReportId: report.id },
    });
    if (existingRequest) {
      if (existingRequest.description !== materialNeeded) {
        await prisma.materialRequest.update({ where: { id: existingRequest.id }, data: { description: materialNeeded } });
      }
    } else {
      await prisma.materialRequest.create({
        data: {
          jobId,
          description: materialNeeded,
          // Quantity/unit aren't known from a one-line field note — the PM
          // fills in the real amount on /materials once they price it out.
          quantity: 1,
          unit: "EA",
          requestedById: submittedById,
          sourceDailyReportId: report.id,
        },
      });
    }
  }

  // --- Change condition -> a pending ChangeOrder the PM can price and
  // submit, instead of a flag someone has to remember to act on. Kept in
  // sync with the field notes only while still untouched (IDENTIFIED) —
  // once the PM has started pricing it, the report no longer overwrites it.
  if (hasChangeCondition && changeConditionNotes) {
    const existingCo = await prisma.changeOrder.findFirst({
      where: { jobId, sourceDailyReportId: report.id },
    });
    if (!existingCo) {
      await prisma.changeOrder.create({
        data: {
          jobId,
          title: changeConditionNotes.slice(0, 80),
          description: changeConditionNotes,
          sourceDailyReportId: report.id,
          createdById: submittedById,
        },
      });
    } else if (existingCo.status === "IDENTIFIED") {
      await prisma.changeOrder.update({
        where: { id: existingCo.id },
        data: { title: changeConditionNotes.slice(0, 80), description: changeConditionNotes },
      });
    }
  }

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
  revalidatePath("/demo/small-project");
  redirect(demoReturnTo(formData, `/jobs/${jobId}`));
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
