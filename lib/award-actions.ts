"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { generateChecklistForStage } from "@/lib/checklist";
import { generateNextJobNumber } from "@/lib/job-number";
import { logAudit } from "@/lib/audit";
import type { CostCategory } from "@prisma/client";

const DAY_MS = 86_400_000;
const ALL_CATEGORIES: CostCategory[] = ["LABOR", "MATERIAL", "EQUIPMENT", "SUBCONTRACTOR", "OTHER"];

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

function strArr(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim());
}

/** Zips several same-named repeatable-row inputs (added/removed client-side
 * in lockstep) into row objects by position, so one FormData covers an
 * arbitrary number of cost code / material / equipment / subcontractor rows
 * without indexed field names. */
function zipRows<K extends string>(formData: FormData, keys: readonly K[]): Record<K, string>[] {
  const arrays = keys.map((k) => formData.getAll(k).map((v) => (typeof v === "string" ? v.trim() : "")));
  const len = Math.max(0, ...arrays.map((a) => a.length));
  const rows: Record<K, string>[] = [];
  for (let i = 0; i < len; i++) {
    const row = {} as Record<K, string>;
    keys.forEach((k, idx) => {
      row[k] = arrays[idx][i] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

/**
 * Single consolidated "award a project" flow: everything captured at award
 * time (customer, contract, budget, cost codes, PM/foreman/crew, dates,
 * initial materials/equipment/subcontractors) in one submit, so a small
 * 5-10 day project goes from awarded to operational without a second trip
 * through separate creation screens. Also closes the crew/schedule gap
 * (lib/alerts.ts's CREW_CONFLICT check) by generating ScheduleAssignment
 * rows for the crew across the project's date range in the same action that
 * formally assigns them — the two are no longer entered independently.
 */
export async function awardProject(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);

  const title = str(formData, "title");
  if (!title) throw new Error("Project title is required");

  const startDateRaw = str(formData, "targetStartDate");
  const endDateRaw = str(formData, "targetEndDate");
  const targetStartDate = startDateRaw ? new Date(startDateRaw) : undefined;
  const targetEndDate = endDateRaw ? new Date(endDateRaw) : undefined;

  // Customer: pick an existing one, or create it inline — no separate trip to /customers.
  let customerId = str(formData, "customerId");
  const newCustomerName = str(formData, "newCustomerName");
  if (!customerId && newCustomerName) {
    const customer = await prisma.customer.create({
      data: { companyId: session.companyId, name: newCustomerName },
    });
    customerId = customer.id;
  }

  const foremanWorkerId = str(formData, "foremanWorkerId");
  // Foreman is implicitly on the crew — no need to also check their box below.
  const crewWorkerIds = Array.from(
    new Set([...strArr(formData, "workerIds"), ...(foremanWorkerId ? [foremanWorkerId] : [])])
  );

  const jobNumber = await generateNextJobNumber(prisma);

  const job = await prisma.job.create({
    data: {
      companyId: session.companyId,
      divisionId: str(formData, "divisionId"),
      jobNumber,
      title,
      description: str(formData, "description"),
      address: str(formData, "location"),
      customerId,
      contractValue: num(formData, "contractValue"),
      projectType: str(formData, "projectType"),
      pmUserId: str(formData, "pmUserId"),
      foremanWorkerId,
      targetStartDate,
      targetEndDate,
      assignments: { create: crewWorkerIds.map((workerId) => ({ workerId })) },
    },
  });

  // Budget by category
  const budgetData = ALL_CATEGORIES.map((category) => ({
    category,
    estimatedAmount: num(formData, `budget_${category}`),
  })).filter((b): b is { category: CostCategory; estimatedAmount: number } => (b.estimatedAmount ?? 0) > 0);
  if (budgetData.length > 0) {
    await prisma.jobBudget.createMany({ data: budgetData.map((b) => ({ jobId: job.id, ...b })) });
  }

  // Cost codes
  const costCodeRows = zipRows(formData, ["costCodeId", "costCodeQty", "costCodeHours"] as const).filter(
    (r) => r.costCodeId && r.costCodeQty
  );
  if (costCodeRows.length > 0) {
    await prisma.jobCostCode.createMany({
      data: costCodeRows.map((r) => ({
        jobId: job.id,
        costCodeId: r.costCodeId,
        estimatedQty: Number(r.costCodeQty) || 0,
        estimatedHours: Number(r.costCodeHours) || 0,
      })),
      skipDuplicates: true,
    });
  }

  // Initial materials
  const materialRows = zipRows(formData, [
    "materialDescription",
    "materialQty",
    "materialUnit",
    "materialVendor",
    "materialExpected",
  ] as const).filter((r) => r.materialDescription);
  if (materialRows.length > 0) {
    await prisma.materialRequest.createMany({
      data: materialRows.map((r) => ({
        jobId: job.id,
        description: r.materialDescription,
        quantity: Number(r.materialQty) || 0,
        unit: r.materialUnit || "EA",
        vendor: r.materialVendor || undefined,
        expectedDeliveryDate: r.materialExpected ? new Date(r.materialExpected) : undefined,
      })),
    });
  }

  // Initial equipment assignments
  const equipmentRows = zipRows(formData, ["equipmentId", "equipmentStart", "equipmentEnd"] as const).filter(
    (r) => r.equipmentId
  );
  if (equipmentRows.length > 0) {
    await prisma.equipmentAssignment.createMany({
      data: equipmentRows.map((r) => ({
        jobId: job.id,
        equipmentId: r.equipmentId,
        startDate: r.equipmentStart ? new Date(r.equipmentStart) : targetStartDate ?? new Date(),
        endDate: r.equipmentEnd ? new Date(r.equipmentEnd) : targetEndDate ?? targetStartDate ?? new Date(),
      })),
    });
  }

  // Initial subcontractors
  const subRows = zipRows(formData, ["subVendor", "subDescription", "subAmount"] as const).filter(
    (r) => r.subVendor
  );
  if (subRows.length > 0) {
    await prisma.subcontractorCost.createMany({
      data: subRows.map((r) => ({
        jobId: job.id,
        vendor: r.subVendor,
        description: r.subDescription || undefined,
        committedAmount: Number(r.subAmount) || 0,
      })),
    });
  }

  // Crew schedule — generated here, not entered separately, so the formal
  // crew (JobAssignment) and the day-by-day schedule (ScheduleAssignment)
  // start in sync instead of drifting apart.
  if (crewWorkerIds.length > 0 && targetStartDate && targetEndDate && targetEndDate >= targetStartDate) {
    const dates: Date[] = [];
    for (let t = targetStartDate.getTime(); t <= targetEndDate.getTime(); t += DAY_MS) {
      dates.push(new Date(t));
    }
    const scheduleData = crewWorkerIds.flatMap((workerId) => dates.map((date) => ({ workerId, jobId: job.id, date })));
    if (scheduleData.length > 0) {
      await prisma.scheduleAssignment.createMany({ data: scheduleData, skipDuplicates: true });
    }
  }

  // Automation: a newly-awarded job starts in PRECON — generate its startup checklist.
  await generateChecklistForStage(prisma, job.id, "PRECON");

  await logAudit(session, {
    action: "job.awarded",
    entityType: "Job",
    entityId: job.id,
    jobId: job.id,
    detail: `${jobNumber} — ${title}`,
  });

  revalidatePath("/jobs");
  revalidatePath("/");
  redirect(`/jobs/${job.id}`);
}
