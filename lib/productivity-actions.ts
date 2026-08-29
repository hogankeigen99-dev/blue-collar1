"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, requireSession } from "@/lib/session";
import { parseCsv } from "@/lib/csv";

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

export async function createCostCode(formData: FormData) {
  await requireRole("ADMIN", "PM");
  const code = str(formData, "code");
  const description = str(formData, "description");
  const unit = str(formData, "unit");
  if (!code || !description || !unit) {
    throw new Error("Code, description, and unit are required");
  }

  await prisma.costCode.create({
    data: { code, description, unit: unit as never },
  });

  revalidatePath("/cost-codes");
  redirect("/cost-codes");
}

export async function addJobCostCode(formData: FormData) {
  await requireRole("ADMIN", "PM");
  const jobId = str(formData, "jobId");
  const costCodeId = str(formData, "costCodeId");
  const estimatedQty = num(formData, "estimatedQty");
  const estimatedHours = num(formData, "estimatedHours");
  if (!jobId || !costCodeId || !estimatedQty || !estimatedHours) {
    throw new Error("Job, cost code, estimated quantity, and estimated hours are required");
  }

  await prisma.jobCostCode.create({
    data: { jobId, costCodeId, estimatedQty, estimatedHours },
  });

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

/**
 * Bulk-loads a job's estimate lines from a CSV (an exported bid/estimate)
 * instead of one budget line at a time. Columns: code,estimatedQty,estimatedHours
 * — an optional header row is detected and skipped. Each code must already
 * exist in the cost code library; rows with an unknown code or non-positive
 * numbers are skipped and reported back on the job page.
 */
export async function importJobCostCodesCsv(formData: FormData) {
  await requireRole("ADMIN", "PM");
  const jobId = str(formData, "jobId");
  if (!jobId) throw new Error("Job is required");

  const file = formData.get("csvFile");
  const pasted = str(formData, "csvText");
  let text = "";
  if (file instanceof File && file.size > 0) {
    text = await file.text();
  } else if (pasted) {
    text = pasted;
  } else {
    throw new Error("Provide a CSV file or paste CSV text");
  }

  const rows = parseCsv(text);
  const looksLikeHeader = rows[0]?.[0]?.trim().toLowerCase() === "code";
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;

  const costCodes = await prisma.costCode.findMany();
  const byCode = new Map(costCodes.map((c) => [c.code.toLowerCase(), c]));

  let imported = 0;
  const skipped: string[] = [];

  for (const [codeRaw, qtyRaw, hoursRaw] of dataRows) {
    const code = (codeRaw ?? "").trim();
    const qty = Number(qtyRaw);
    const hours = Number(hoursRaw);
    const costCode = code ? byCode.get(code.toLowerCase()) : undefined;

    if (!costCode || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(hours) || hours <= 0) {
      skipped.push(code || "(blank)");
      continue;
    }

    await prisma.jobCostCode.upsert({
      where: { jobId_costCodeId: { jobId, costCodeId: costCode.id } },
      update: { estimatedQty: qty, estimatedHours: hours },
      create: { jobId, costCodeId: costCode.id, estimatedQty: qty, estimatedHours: hours },
    });
    imported++;
  }

  revalidatePath(`/jobs/${jobId}`);
  const params = new URLSearchParams({ imported: String(imported) });
  if (skipped.length > 0) params.set("skipped", skipped.join(", "));
  redirect(`/jobs/${jobId}?${params.toString()}`);
}

export async function logProduction(formData: FormData) {
  await requireSession(); // foreman's core workflow — any signed-in role
  const jobId = str(formData, "jobId");
  const jobCostCodeId = str(formData, "jobCostCodeId");
  const dateRaw = str(formData, "date");
  const hours = num(formData, "hours");
  const quantity = num(formData, "quantity");
  const crewSize = num(formData, "crewSize");
  if (!jobId || !jobCostCodeId || !dateRaw || hours === undefined || quantity === undefined) {
    throw new Error("Cost code, date, hours, and quantity are required");
  }

  await prisma.productionEntry.create({
    data: {
      jobCostCodeId,
      date: new Date(dateRaw),
      hours,
      quantity,
      crewSize: crewSize !== undefined ? Math.round(crewSize) : undefined,
      notes: str(formData, "notes"),
      enteredById: str(formData, "enteredById"),
    },
  });

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}
