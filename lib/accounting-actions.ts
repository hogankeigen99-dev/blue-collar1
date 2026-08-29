"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export async function setAccountingMapping(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const category = str(formData, "category");
  const glCode = str(formData, "glCode");
  if (!category || !glCode) throw new Error("Category and GL code are required");

  // upsert is deliberately left unscoped by scopedPrisma() — pass the
  // compound (companyId + category) unique key explicitly.
  await prisma.accountingCategoryMapping.upsert({
    where: { companyId_category: { companyId: session.companyId, category: category as never } },
    update: { glCode, glAccountName: str(formData, "glAccountName") },
    create: { companyId: session.companyId, category: category as never, glCode, glAccountName: str(formData, "glAccountName") },
  });

  revalidatePath("/accounting");
  redirect("/accounting");
}

export async function setCostCodeGlCode(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const costCodeId = str(formData, "costCodeId");
  if (!costCodeId) throw new Error("Cost code is required");

  await prisma.costCode.update({
    where: { id: costCodeId },
    data: { glCode: str(formData, "glCode") ?? null },
  });

  revalidatePath("/accounting");
  redirect("/accounting");
}
