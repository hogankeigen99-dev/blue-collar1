"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
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
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const code = str(formData, "code");
  const description = str(formData, "description");
  const unit = str(formData, "unit");
  if (!code || !description || !unit) {
    throw new Error("Code, description, and unit are required");
  }

  await prisma.costCode.create({
    data: { companyId: session.companyId, code, description, unit: unit as never },
  });

  revalidatePath("/cost-codes");
  redirect("/cost-codes");
}

export async function addJobCostCode(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const jobId = str(formData, "jobId");
  const costCodeId = str(formData, "costCodeId");
  const estimatedQty = num(formData, "estimatedQty");
  const estimatedHours = num(formData, "estimatedHours");
  if (!jobId || !costCodeId || !estimatedQty || !estimatedHours) {
    throw new Error("Job, cost code, estimated quantity, and estimated hours are required");
  }

  // JobCostCode is a child of both Job and CostCode — verify both belong to
  // this company before creating against them.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });
  await prisma.costCode.findFirstOrThrow({ where: { id: costCodeId } });

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
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const jobId = str(formData, "jobId");
  if (!jobId) throw new Error("Job is required");

  // JobCostCode.upsert is deliberately left unscoped by scopedPrisma() —
  // verify the job belongs to this company before writing against it.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });

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
