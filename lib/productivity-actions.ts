"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

export async function logProduction(formData: FormData) {
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
