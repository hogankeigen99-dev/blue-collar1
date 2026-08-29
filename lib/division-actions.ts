"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export async function createDivision(formData: FormData) {
  const session = await requireRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);
  const name = str(formData, "name");
  if (!name) throw new Error("Name is required");

  await prisma.division.create({ data: { companyId: session.companyId, name } });

  revalidatePath("/settings/divisions");
  redirect("/settings/divisions");
}

export async function renameDivision(formData: FormData) {
  const session = await requireRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);
  const id = str(formData, "id");
  const name = str(formData, "name");
  if (!id || !name) throw new Error("Division and name are required");

  await prisma.division.update({ where: { id }, data: { name } });

  revalidatePath("/settings/divisions");
  redirect("/settings/divisions");
}

/** Jobs and workers in this division are not deleted — they're just
 * unassigned from it (divisionId set to null), same as unplugging an
 * organizational label rather than deleting the underlying records. */
export async function deleteDivision(formData: FormData) {
  const session = await requireRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);
  const id = str(formData, "id");
  if (!id) throw new Error("Division is required");

  await prisma.division.delete({ where: { id } });

  revalidatePath("/settings/divisions");
  redirect("/settings/divisions");
}
