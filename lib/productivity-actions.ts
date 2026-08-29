"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession, requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";

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
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const jobId = str(formData, "jobId");
  const description = str(formData, "description");
  const quantity = num(formData, "quantity");
  const unit = str(formData, "unit");
  if (!jobId || !description || quantity === undefined || !unit) {
    throw new Error("Job, description, quantity, and unit are required");
  }

  // MaterialRequest is a child of Job (no companyId of its own) — verify
  // the job belongs to this company before creating against it.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });

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
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const id = str(formData, "id");
  const jobId = str(formData, "jobId");
  const status = str(formData, "status");
  if (!id || !jobId || !status) throw new Error("Request, job, and status are required");

  // MaterialRequest isn't a tenant model — verify the job belongs to this
  // company, then that the request belongs to that job, before updating it.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });
  const existing = await prisma.materialRequest.findFirst({ where: { id, jobId } });
  if (!existing) throw new Error("Material request not found");

  const receivedDateRaw = str(formData, "receivedDate");
  const expectedDeliveryRaw = str(formData, "expectedDeliveryDate");

  const totalCost = num(formData, "totalCost");
  const updated = await prisma.materialRequest.update({
    where: { id },
    data: {
      status: status as never,
      vendor: str(formData, "vendor"),
      poNumber: str(formData, "poNumber"),
      unitCost: num(formData, "unitCost"),
      totalCost,
      expectedDeliveryDate: expectedDeliveryRaw ? new Date(expectedDeliveryRaw) : undefined,
      receivedDate: receivedDateRaw ? new Date(receivedDateRaw) : undefined,
    },
  });

  // A PO issuance or receipt is a real financial commitment/realization —
  // worth an audit trail entry the way invoice/change-order money events are.
  if (status === "PO_ISSUED" || status === "RECEIVED") {
    await logAudit(session, {
      action: status === "PO_ISSUED" ? "material_request.po_issued" : "material_request.received",
      entityType: "MaterialRequest",
      entityId: id,
      jobId,
      detail: `${updated.description} — ${totalCost ?? updated.totalCost ?? "no cost recorded"}${updated.poNumber ? ` (PO ${updated.poNumber})` : ""}`,
    });
  }

  revalidatePath(`/jobs/${jobId}/materials`);
  redirect(`/jobs/${jobId}/materials`);
}
