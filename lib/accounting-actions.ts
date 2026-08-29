"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export async function setAccountingMapping(formData: FormData) {
  await requireRole("ADMIN", "PM");
  const category = str(formData, "category");
  const glCode = str(formData, "glCode");
  if (!category || !glCode) throw new Error("Category and GL code are required");

  await prisma.accountingCategoryMapping.upsert({
    where: { category: category as never },
    update: { glCode, glAccountName: str(formData, "glAccountName") },
    create: { category: category as never, glCode, glAccountName: str(formData, "glAccountName") },
  });

  revalidatePath("/accounting");
  redirect("/accounting");
}

export async function setCostCodeGlCode(formData: FormData) {
  await requireRole("ADMIN", "PM");
  const costCodeId = str(formData, "costCodeId");
  if (!costCodeId) throw new Error("Cost code is required");

  await prisma.costCode.update({
    where: { id: costCodeId },
    data: { glCode: str(formData, "glCode") ?? null },
  });

  revalidatePath("/accounting");
  redirect("/accounting");
}
