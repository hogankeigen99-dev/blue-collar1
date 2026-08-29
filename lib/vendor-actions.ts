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

export async function createVendor(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const name = str(formData, "name");
  if (!name) throw new Error("Vendor name is required");

  const vendor = await prisma.vendor.create({
    data: { companyId: session.companyId, name, trade: str(formData, "trade"), contactInfo: str(formData, "contactInfo") },
  });
  await logAudit(session, {
    action: "vendor.created",
    entityType: "Vendor",
    entityId: vendor.id,
    detail: name,
  });

  revalidatePath("/vendors");
  redirect(`/vendors/${vendor.id}`);
}

export async function updateVendor(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const id = str(formData, "id");
  if (!id) throw new Error("Vendor is required");

  // Vendor is a tenant model — findFirst below is auto-scoped by companyId.
  await prisma.vendor.findFirstOrThrow({ where: { id } });
  await prisma.vendor.update({
    where: { id },
    data: { trade: str(formData, "trade"), contactInfo: str(formData, "contactInfo") },
  });

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${id}`);
  redirect(`/vendors/${id}`);
}
