"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";
import { generateNextInvoiceNumber } from "@/lib/invoice-number";

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Creates a pay application — the AIA G702/G703-style progress bill every
 * commercial GC actually bills with: one line per Schedule of Values line,
 * this period's amount and retainage withheld derived from cumulative %
 * complete instead of a single typed total (see prisma/schema.prisma's
 * InvoiceLine and docs/OPERATING-DATA-MODEL.md). A SOV line left blank on
 * this pay app just isn't billed this period.
 */
export async function createPayApplication(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const jobId = str(formData, "jobId");
  const dateRaw = str(formData, "date");
  if (!jobId || !dateRaw) throw new Error("Job and date are required");

  // Invoice/Contract aren't tenant models — verify the job belongs to this
  // company before creating anything against it.
  const job = await prisma.job.findFirstOrThrow({ where: { id: jobId } });
  const contract = await prisma.contract.findFirst({ where: { jobId }, include: { lines: { include: { invoiceLines: true } } } });
  if (!contract || contract.lines.length === 0) {
    throw new Error("This job has no Schedule of Values yet — set one up on the contract page before billing against it.");
  }

  const lineIds = formData.getAll("contractLineId").map((v) => String(v));
  const pctValues = formData.getAll("pctCompleteToDate").map((v) => String(v));

  const retainagePct = contract.retainagePct ?? 0;
  const lineData: {
    contractLineId: string;
    pctCompleteThisPeriod: number;
    pctCompleteToDate: number;
    amountThisPeriod: number;
    retainageWithheld: number;
  }[] = [];

  lineIds.forEach((lineId, i) => {
    const raw = pctValues[i];
    if (raw === undefined || raw.trim() === "") return;
    const pctToDate = Number(raw);
    if (!Number.isFinite(pctToDate)) return;

    const line = contract.lines.find((l) => l.id === lineId);
    if (!line) throw new Error("Unknown Schedule of Values line submitted");

    const priorPct = line.invoiceLines.reduce((max, il) => Math.max(max, il.pctCompleteToDate), 0);
    if (pctToDate > 100) throw new Error(`"${line.description}" can't be billed past 100% complete`);
    if (pctToDate < priorPct) {
      throw new Error(`"${line.description}" is already billed to ${priorPct}% — can't bill back below that`);
    }
    if (pctToDate === priorPct) return; // no change this period

    const amountToDate = round2((pctToDate / 100) * line.scheduledValue);
    const priorAmount = round2((priorPct / 100) * line.scheduledValue);
    const amountThisPeriod = round2(amountToDate - priorAmount);
    if (amountThisPeriod <= 0) return;

    lineData.push({
      contractLineId: line.id,
      pctCompleteThisPeriod: round2(pctToDate - priorPct),
      pctCompleteToDate: pctToDate,
      amountThisPeriod,
      retainageWithheld: round2(amountThisPeriod * (retainagePct / 100)),
    });
  });

  if (lineData.length === 0) {
    throw new Error("Nothing to bill — enter a % complete for at least one Schedule of Values line");
  }

  const amount = round2(lineData.reduce((s, l) => s + l.amountThisPeriod - l.retainageWithheld, 0));
  const invoiceNumber = await generateNextInvoiceNumber(prisma, jobId, job.jobNumber);

  const invoice = await prisma.invoice.create({
    data: {
      jobId,
      invoiceNumber,
      amount,
      date: new Date(dateRaw),
      notes: str(formData, "notes"),
      lines: { create: lineData },
    },
  });

  await logAudit(session, {
    action: "invoice.created",
    entityType: "Invoice",
    entityId: invoice.id,
    jobId,
    detail: `${invoiceNumber} — ${amount} due (${lineData.length} SOV line${lineData.length === 1 ? "" : "s"} billed)`,
  });

  revalidatePath(`/jobs/${jobId}/invoices`);
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}/invoices`);
}

/**
 * Retainage release — the closeout billing event that pays out everything
 * withheld across the contract's Schedule of Values. Modeled as one more
 * pay application (not a new record type): every SOV line with retainage
 * actually held (SENT/PAID invoices only, same as lib/cash.ts's
 * getRetainageSummary) gets a zero-new-work line whose retainageWithheld is
 * negative — the same "amountThisPeriod minus retainageWithheld" formula
 * that computes every other invoice's amount then bills exactly the
 * released total. Once that invoice is itself SENT/PAID, getRetainageSummary
 * nets straight back to zero with no separate release flag needed on either
 * the Contract or the Invoice.
 */
export async function releaseRetainage(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const jobId = str(formData, "jobId");
  const dateRaw = str(formData, "date");
  if (!jobId || !dateRaw) throw new Error("Job and date are required");

  // Invoice/Contract aren't tenant models — verify the job belongs to this
  // company before creating anything against it.
  const job = await prisma.job.findFirstOrThrow({ where: { id: jobId } });
  if (job.stage !== "CLOSEOUT" && job.stage !== "COMPLETE") {
    throw new Error("Retainage release is only available once a job reaches Closeout.");
  }

  const contract = await prisma.contract.findFirst({
    where: { jobId },
    include: { lines: { include: { invoiceLines: { include: { invoice: true } } } } },
  });
  if (!contract || contract.lines.length === 0) {
    throw new Error("This job has no Schedule of Values to release retainage against.");
  }

  // A release invoice's own lines carry negative retainageWithheld — if one
  // already exists, this job has already had its retainage released.
  const alreadyReleased = await prisma.invoiceLine.findFirst({
    where: { retainageWithheld: { lt: 0 }, invoice: { jobId } },
  });
  if (alreadyReleased) {
    throw new Error("Retainage has already been released for this job.");
  }

  const lineData: {
    contractLineId: string;
    pctCompleteThisPeriod: number;
    pctCompleteToDate: number;
    amountThisPeriod: number;
    retainageWithheld: number;
  }[] = [];

  for (const line of contract.lines) {
    const billedLines = line.invoiceLines.filter((il) => il.invoice.status === "SENT" || il.invoice.status === "PAID");
    const held = round2(billedLines.reduce((s, il) => s + il.retainageWithheld, 0));
    if (held <= 0) continue;
    const pctToDate = billedLines.reduce((max, il) => Math.max(max, il.pctCompleteToDate), 0);
    lineData.push({
      contractLineId: line.id,
      pctCompleteThisPeriod: 0,
      pctCompleteToDate: pctToDate,
      amountThisPeriod: 0,
      retainageWithheld: -held,
    });
  }

  if (lineData.length === 0) {
    throw new Error("No retainage is currently held on this job's Schedule of Values.");
  }

  const amount = round2(lineData.reduce((s, l) => s + l.amountThisPeriod - l.retainageWithheld, 0));
  const invoiceNumber = await generateNextInvoiceNumber(prisma, jobId, job.jobNumber);

  const invoice = await prisma.invoice.create({
    data: {
      jobId,
      invoiceNumber,
      amount,
      date: new Date(dateRaw),
      notes: "Retainage release",
      lines: { create: lineData },
    },
  });

  await logAudit(session, {
    action: "invoice.retainage_released",
    entityType: "Invoice",
    entityId: invoice.id,
    jobId,
    detail: `${invoiceNumber} — ${amount} retainage released`,
  });

  revalidatePath(`/jobs/${jobId}/invoices`);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/cash");
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
  } else if (status === "PAID") {
    await logAudit(session, {
      action: "invoice.paid",
      entityType: "Invoice",
      entityId: id,
      jobId,
      detail: `${inv.invoiceNumber} — ${inv.amount}`,
    });
  }

  revalidatePath(`/jobs/${jobId}/invoices`);
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}/invoices`);
}
