"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";

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
  await logAudit(session, {
    action: "accounting_mapping.set",
    entityType: "AccountingCategoryMapping",
    entityId: category,
    detail: `${category} -> GL ${glCode}`,
  });

  revalidatePath("/accounting");
  redirect("/accounting");
}

export async function setCostCodeGlCode(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const costCodeId = str(formData, "costCodeId");
  if (!costCodeId) throw new Error("Cost code is required");

  const glCode = str(formData, "glCode") ?? null;
  const costCode = await prisma.costCode.update({
    where: { id: costCodeId },
    data: { glCode },
  });
  await logAudit(session, {
    action: "cost_code.gl_code_set",
    entityType: "CostCode",
    entityId: costCodeId,
    detail: `${costCode.code} -> GL ${glCode ?? "(cleared)"}`,
  });

  revalidatePath("/accounting");
  redirect("/accounting");
}
