"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";

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

export async function createInvoice(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const jobId = str(formData, "jobId");
  const invoiceNumber = str(formData, "invoiceNumber");
  const amount = num(formData, "amount");
  const date = str(formData, "date");
  if (!jobId || !invoiceNumber || amount === undefined || !date) {
    throw new Error("Job, invoice number, amount, and date are required");
  }

  // Invoice is a child of Job (no companyId of its own) — verify the job
  // belongs to this company before creating against it.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });

  await prisma.invoice.create({
    data: { jobId, invoiceNumber, amount, date: new Date(date), notes: str(formData, "notes") },
  });

  revalidatePath(`/jobs/${jobId}/invoices`);
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}/invoices`);
}

export async function updateInvoiceStatus(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const id = str(formData, "id");
  const jobId = str(formData, "jobId");
  const status = str(formData, "status");
  if (!id || !jobId || !status) throw new Error("Invoice, job, and status are required");

  // Invoice isn't a tenant model — verify the job belongs to this company,
  // then that the invoice belongs to that job, before updating it.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });
  const existing = await prisma.invoice.findFirst({ where: { id, jobId } });
  if (!existing) throw new Error("Invoice not found");

  const inv = await prisma.invoice.update({ where: { id }, data: { status: status as never } });

  if (status === "SENT") {
    await logAudit(session, {
      action: "invoice.sent",
      entityType: "Invoice",
      entityId: id,
      jobId,
      detail: `${inv.invoiceNumber} — ${inv.amount}`,
    });
    await dispatchWebhook(session.companyId, "INVOICE_SENT", { jobId, invoiceId: id, invoiceNumber: inv.invoiceNumber, amount: inv.amount });
  }

  revalidatePath(`/jobs/${jobId}/invoices`);
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}/invoices`);
}
