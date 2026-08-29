"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession, requireRole } from "@/lib/session";

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

/** Field request — any signed-in role can flag a material need. */
export async function createMaterialRequest(formData: FormData) {
  await requireSession();
  const jobId = str(formData, "jobId");
  const description = str(formData, "description");
  const quantity = num(formData, "quantity");
  const unit = str(formData, "unit");
  if (!jobId || !description || quantity === undefined || !unit) {
    throw new Error("Job, description, quantity, and unit are required");
  }

  await prisma.materialRequest.create({
    data: {
      jobId,
      description,
      quantity,
      unit,
      requestedById: str(formData, "requestedById"),
    },
  });

  revalidatePath(`/jobs/${jobId}/materials`);
  redirect(`/jobs/${jobId}/materials`);
}

/** PM approval → vendor/PO → ordered → received. PM/ADMIN only — this is the procurement side of the workflow. */
export async function updateMaterialRequest(formData: FormData) {
  await requireRole("ADMIN", "PM");
  const id = str(formData, "id");
  const jobId = str(formData, "jobId");
  const status = str(formData, "status");
  if (!id || !jobId || !status) throw new Error("Request, job, and status are required");

  const receivedDateRaw = str(formData, "receivedDate");
  const expectedDeliveryRaw = str(formData, "expectedDeliveryDate");

  await prisma.materialRequest.update({
    where: { id },
    data: {
      status: status as never,
      vendor: str(formData, "vendor"),
      poNumber: str(formData, "poNumber"),
      unitCost: num(formData, "unitCost"),
      totalCost: num(formData, "totalCost"),
      expectedDeliveryDate: expectedDeliveryRaw ? new Date(expectedDeliveryRaw) : undefined,
      receivedDate: receivedDateRaw ? new Date(receivedDateRaw) : undefined,
    },
  });

  revalidatePath(`/jobs/${jobId}/materials`);
  redirect(`/jobs/${jobId}/materials`);
}
