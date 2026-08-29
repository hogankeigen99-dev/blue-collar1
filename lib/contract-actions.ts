"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { ensureContract } from "@/lib/contract";

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

/** Type, retainage, and executed date — the SOV lines themselves are edited
 * separately (addContractLine below). PM/ADMIN only, same as every other
 * contract-value-adjacent action. */
export async function updateContract(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const jobId = str(formData, "jobId");
  if (!jobId) throw new Error("Job is required");

  await prisma.job.findFirstOrThrow({ where: { id: jobId } });
  const contract = await ensureContract(prisma, jobId);

  const executedDateRaw = str(formData, "executedDate");
  await prisma.contract.update({
    where: { id: contract.id },
    data: {
      type: (str(formData, "type") as never) ?? contract.type,
      retainagePct: num(formData, "retainagePct"),
      executedDate: executedDateRaw ? new Date(executedDateRaw) : undefined,
    },
  });

  await logAudit(session, {
    action: "contract.updated",
    entityType: "Contract",
    entityId: contract.id,
    jobId,
    detail: `${str(formData, "type") ?? contract.type}`,
  });

  revalidatePath(`/jobs/${jobId}/contract`);
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}/contract`);
}

/** Adds a manual Schedule of Values line — splitting or extending the SOV
 * beyond the single starting line Award created. Not for change-order
 * lines, which are created automatically on approval
 * (lib/change-order-actions.ts). */
export async function addContractLine(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const jobId = str(formData, "jobId");
  const description = str(formData, "description");
  const scheduledValue = num(formData, "scheduledValue");
  if (!jobId || !description || scheduledValue === undefined) {
    throw new Error("Job, description, and scheduled value are required");
  }

  await prisma.job.findFirstOrThrow({ where: { id: jobId } });
  const contract = await ensureContract(prisma, jobId);
  const lineCount = await prisma.contractLine.count({ where: { contractId: contract.id } });

  const line = await prisma.contractLine.create({
    data: { contractId: contract.id, description, scheduledValue, sortOrder: lineCount },
  });

  await logAudit(session, {
    action: "contract_line.added",
    entityType: "ContractLine",
    entityId: line.id,
    jobId,
    detail: `${description} — ${scheduledValue}`,
  });

  revalidatePath(`/jobs/${jobId}/contract`);
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}/contract`);
}

/** Removes a manually-mis-entered SOV line — only while nothing has been
 * billed against it yet (once a pay application references a line, its
 * billing history has to stay intact, so it can't be deleted out from
 * under it) and only for a manual line (a CO-sourced line comes and goes
 * with its ChangeOrder's approval, not by hand). */
export async function deleteContractLine(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const jobId = str(formData, "jobId");
  const lineId = str(formData, "lineId");
  if (!jobId || !lineId) throw new Error("Job and line are required");

  await prisma.job.findFirstOrThrow({ where: { id: jobId } });
  const contract = await prisma.contract.findFirst({ where: { jobId } });
  const line = contract
    ? await prisma.contractLine.findFirst({
        where: { id: lineId, contractId: contract.id },
        include: { invoiceLines: true },
      })
    : null;
  if (!line) throw new Error("SOV line not found");
  if (line.sourceChangeOrderId) throw new Error("This line came from a change order — reject or un-approve it there instead");
  if (line.invoiceLines.length > 0) throw new Error("Can't remove a SOV line that's already been billed against");

  await prisma.contractLine.delete({ where: { id: lineId } });

  revalidatePath(`/jobs/${jobId}/contract`);
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}/contract`);
}
