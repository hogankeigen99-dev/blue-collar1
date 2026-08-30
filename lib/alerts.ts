import { scopedPrisma } from "@/lib/tenant";
import { computeProgress } from "@/lib/productivity";
import { getJobCosting } from "@/lib/job-costing";
import { getBillingReadiness } from "@/lib/billing";
import { formatMoney } from "@/lib/format";
import type { Prisma } from "@prisma/client";

export type AlertType =
  | "LABOR_OVERRUN"
  | "SCHEDULE_RISK"
  | "MISSING_FIELD_REPORT"
  | "MATERIAL_RISK"
  | "CREW_CONFLICT"
  | "UNAPPROVED_CHANGE_WORK"
  | "BILLING_BLOCKER"
  | "MARGIN_RISK"
  | "EQUIPMENT_ISSUE"
  | "COI_EXPIRED"
  | "PERMIT_EXPIRED"
  | "AR_SEVERELY_OVERDUE"
  | "AP_SEVERELY_OVERDUE";

export type Alert = {
  type: AlertType;
  severity: "warning" | "critical";
  jobId: string;
  jobTitle: string;
  message: string;
};

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  LABOR_OVERRUN: "Labor overrun",
  SCHEDULE_RISK: "Schedule risk",
  MISSING_FIELD_REPORT: "Missing field report",
  MATERIAL_RISK: "Material risk",
  CREW_CONFLICT: "Crew conflict",
  UNAPPROVED_CHANGE_WORK: "Unapproved change work",
  BILLING_BLOCKER: "Billing blocker",
  MARGIN_RISK: "Margin risk",
  EQUIPMENT_ISSUE: "Equipment issue",
  COI_EXPIRED: "COI expired",
  PERMIT_EXPIRED: "Permit expired",
  AR_SEVERELY_OVERDUE: "AR severely overdue",
  AP_SEVERELY_OVERDUE: "AP severely overdue",
};

const DAY_MS = 86_400_000;
const MARGIN_WARNING_PCT = 0.1;
const EQUIPMENT_ISSUE_WINDOW_DAYS = 3;
const COI_WARNING_DAYS = 30;
const PERMIT_WARNING_DAYS = 30;
// Same boundary as lib/cash.ts's "61-90" / "90+" aging buckets — an invoice
// or payable outstanding 61+ days is flagged (warning), 90+ is critical.
const OVERDUE_WARNING_DAYS = 61;
const OVERDUE_CRITICAL_DAYS = 90;

const jobWithAlertIncludes = {
  assignments: true,
  costCodes: { include: { entries: true } },
  scheduleAssignments: true,
  dailyReports: { orderBy: { date: "desc" as const }, take: 1 },
  materialRequests: true,
  changeOrders: true,
  subcontracts: { include: { vendor: true } },
  invoices: { where: { status: "SENT" as const } },
} satisfies Prisma.JobInclude;

type JobForAlerts = Prisma.JobGetPayload<{ include: typeof jobWithAlertIncludes }>;

/** Per-job alert computation, shared by getAlerts (company-wide scan) and
 * getJobAlerts (single job, for the job Command Center's exceptions field) —
 * takes an already-company-scoped client (lib/tenant.ts). */
async function computeJobAlerts(
  prisma: ReturnType<typeof scopedPrisma>,
  companyId: string,
  job: JobForAlerts,
  now: number
): Promise<Alert[]> {
  const alerts: Alert[] = [];

  // Labor overrun — reuses the same variance calc as the job detail page.
  for (const jcc of job.costCodes) {
    const progress = computeProgress(jcc.estimatedQty, jcc.estimatedHours, jcc.entries);
    if (progress.status === "over_budget" || progress.status === "watch") {
      alerts.push({
        type: "LABOR_OVERRUN",
        severity: progress.status === "over_budget" ? "critical" : "warning",
        jobId: job.id,
        jobTitle: job.title,
        message: `Running ${((progress.hoursVariancePct ?? 0) * 100).toFixed(0)}% over budgeted hrs on a cost code`,
      });
    }
  }

  // Schedule risk — past or approaching the target finish date while not done.
  const notDone = job.stage !== "COMPLETE" && job.status !== "COMPLETED";
  if (job.targetEndDate && notDone) {
    const daysToTarget = Math.floor((job.targetEndDate.getTime() - now) / DAY_MS);
    if (daysToTarget < 0) {
      alerts.push({
        type: "SCHEDULE_RISK",
        severity: "critical",
        jobId: job.id,
        jobTitle: job.title,
        message: `${Math.abs(daysToTarget)} day(s) past target finish date and not complete`,
      });
    } else if (daysToTarget <= 5 && (job.stage === "PRECON" || job.stage === "MOBILIZATION")) {
      alerts.push({
        type: "SCHEDULE_RISK",
        severity: "warning",
        jobId: job.id,
        jobTitle: job.title,
        message: `Target finish in ${daysToTarget} day(s) but job is still in ${job.stage}`,
      });
    }
  }

  // Missing field report — active jobs with no recent daily report.
  if (job.status === "IN_PROGRESS") {
    const last = job.dailyReports[0];
    const daysSince = last ? Math.floor((now - last.date.getTime()) / DAY_MS) : null;
    if (!last) {
      alerts.push({
        type: "MISSING_FIELD_REPORT",
        severity: "warning",
        jobId: job.id,
        jobTitle: job.title,
        message: "No daily field reports submitted yet",
      });
    } else if (daysSince !== null && daysSince > 2) {
      alerts.push({
        type: "MISSING_FIELD_REPORT",
        severity: daysSince > 5 ? "critical" : "warning",
        jobId: job.id,
        jobTitle: job.title,
        message: `Last daily report was ${daysSince} day(s) ago`,
      });
    }
  }

  // Material risk — open requests past their expected delivery date.
  const overdueMaterial = job.materialRequests.filter(
    (m) =>
      ["REQUESTED", "APPROVED", "PO_ISSUED", "ORDERED"].includes(m.status) &&
      m.expectedDeliveryDate &&
      m.expectedDeliveryDate.getTime() < now
  );
  for (const m of overdueMaterial) {
    const daysLate = Math.floor((now - m.expectedDeliveryDate!.getTime()) / DAY_MS);
    alerts.push({
      type: "MATERIAL_RISK",
      severity: daysLate > 3 ? "critical" : "warning",
      jobId: job.id,
      jobTitle: job.title,
      message: `"${m.description}" is ${daysLate} day(s) past expected delivery (status: ${m.status})`,
    });
  }

  // Crew conflict — someone scheduled on the job who isn't formally assigned to it.
  const assignedWorkerIds = new Set(job.assignments.map((a) => a.workerId));
  const scheduledOnlyWorkerIds = new Set(
    job.scheduleAssignments.filter((sa) => !assignedWorkerIds.has(sa.workerId)).map((sa) => sa.workerId)
  );
  if (scheduledOnlyWorkerIds.size > 0) {
    alerts.push({
      type: "CREW_CONFLICT",
      severity: "warning",
      jobId: job.id,
      jobTitle: job.title,
      message: `${scheduledOnlyWorkerIds.size} worker(s) on the schedule aren't formally assigned to this job`,
    });
  }

  // Unapproved change work — field flagged a change condition that hasn't
  // become a change order yet (a legacy/manual gap — lib/daily-report-actions.ts
  // now opens one automatically), or a change order exists but hasn't
  // reached approval (IDENTIFIED/PRICED/SUBMITTED all still need PM action).
  const flaggedReports = await prisma.dailyReport.findMany({
    where: { jobId: job.id, hasChangeCondition: true, changeOrders: { none: {} } },
  });
  for (const r of flaggedReports) {
    alerts.push({
      type: "UNAPPROVED_CHANGE_WORK",
      severity: "warning",
      jobId: job.id,
      jobTitle: job.title,
      message: `Change condition flagged on ${r.date.toISOString().slice(0, 10)} hasn't become a change order yet`,
    });
  }
  const CO_STATUS_DESCRIPTION: Record<string, string> = {
    IDENTIFIED: "identified but not yet priced",
    PRICED: "priced but not yet submitted for approval",
    SUBMITTED: "submitted and awaiting approval",
  };
  const pendingCOs = job.changeOrders.filter((co) => co.status in CO_STATUS_DESCRIPTION);
  for (const co of pendingCOs) {
    alerts.push({
      type: "UNAPPROVED_CHANGE_WORK",
      severity: "warning",
      jobId: job.id,
      jobTitle: job.title,
      message: `Change order "${co.title}" is ${CO_STATUS_DESCRIPTION[co.status]}`,
    });
  }

  // Equipment issue — flagged on a recent daily report and not yet resolved
  // by a later one, so a PM sees it without reading through every report.
  const recentEquipmentIssues = await prisma.dailyReport.findMany({
    where: {
      jobId: job.id,
      equipmentIssue: { not: null },
      date: { gte: new Date(now - EQUIPMENT_ISSUE_WINDOW_DAYS * DAY_MS) },
    },
    orderBy: { date: "desc" },
  });
  for (const r of recentEquipmentIssues) {
    const daysAgo = Math.floor((now - r.date.getTime()) / DAY_MS);
    alerts.push({
      type: "EQUIPMENT_ISSUE",
      severity: daysAgo >= 2 ? "critical" : "warning",
      jobId: job.id,
      jobTitle: job.title,
      message: `Equipment issue flagged ${daysAgo <= 0 ? "today" : `${daysAgo} day(s) ago`}: ${r.equipmentIssue}`,
    });
  }

  // COI expired — an executed subcontract's certificate of insurance has
  // lapsed or is about to, on a job that's still actually running. Only
  // EXECUTED agreements matter here — a DRAFT hasn't started work, and a
  // CLOSED one is already done.
  if (notDone) {
    const executedSubs = job.subcontracts.filter((s) => s.agreementStatus === "EXECUTED" && s.coiExpirationDate);
    for (const s of executedSubs) {
      const daysToExpiry = Math.floor((s.coiExpirationDate!.getTime() - now) / DAY_MS);
      if (daysToExpiry > COI_WARNING_DAYS) continue;
      const vendorName = s.vendor?.name ?? "Subcontractor";
      alerts.push({
        type: "COI_EXPIRED",
        severity: daysToExpiry < 0 ? "critical" : "warning",
        jobId: job.id,
        jobTitle: job.title,
        message:
          daysToExpiry < 0
            ? `${vendorName}'s certificate of insurance expired ${Math.abs(daysToExpiry)} day(s) ago`
            : `${vendorName}'s certificate of insurance expires in ${daysToExpiry} day(s)`,
      });
    }
  }

  // Permit expired — a job's own permit has lapsed or is about to, while
  // it's still actually running. Same shape as COI_EXPIRED just above, one
  // record's date instead of every subcontract's.
  if (notDone && job.permitExpirationDate) {
    const daysToExpiry = Math.floor((job.permitExpirationDate.getTime() - now) / DAY_MS);
    if (daysToExpiry <= PERMIT_WARNING_DAYS) {
      alerts.push({
        type: "PERMIT_EXPIRED",
        severity: daysToExpiry < 0 ? "critical" : "warning",
        jobId: job.id,
        jobTitle: job.title,
        message:
          daysToExpiry < 0
            ? `Permit ${job.permitNumber ?? ""} expired ${Math.abs(daysToExpiry)} day(s) ago`.trim()
            : `Permit ${job.permitNumber ?? ""} expires in ${daysToExpiry} day(s)`.trim(),
      });
    }
  }

  // AR severely overdue — a billed pay application that's gone unpaid well
  // past the point normal collection takes, same 61/90-day boundary as
  // lib/cash.ts's "61-90"/"90+" aging buckets. Only SENT invoices matter —
  // DRAFT hasn't gone out, PAID is resolved.
  for (const inv of job.invoices) {
    const daysOutstanding = Math.floor((now - inv.date.getTime()) / DAY_MS);
    if (daysOutstanding < OVERDUE_WARNING_DAYS) continue;
    alerts.push({
      type: "AR_SEVERELY_OVERDUE",
      severity: daysOutstanding >= OVERDUE_CRITICAL_DAYS ? "critical" : "warning",
      jobId: job.id,
      jobTitle: job.title,
      message: `Invoice ${inv.invoiceNumber} (${formatMoney(inv.amount)}) has been outstanding ${daysOutstanding} days`,
    });
  }

  // AP severely overdue — what we owe a sub or material vendor, unpaid well
  // past normal terms. Same source rows and anchor dates as lib/cash.ts's
  // getApAging (executedDate for an invoiced subcontract, receivedDate for a
  // received-but-unpaid material request).
  const invoicedSubs = job.subcontracts.filter((s) => s.status === "INVOICED");
  for (const s of invoicedSubs) {
    const anchor = s.executedDate ?? s.createdAt;
    const daysOutstanding = Math.floor((now - anchor.getTime()) / DAY_MS);
    if (daysOutstanding < OVERDUE_WARNING_DAYS) continue;
    const vendorName = s.vendor?.name ?? "Subcontractor";
    alerts.push({
      type: "AP_SEVERELY_OVERDUE",
      severity: daysOutstanding >= OVERDUE_CRITICAL_DAYS ? "critical" : "warning",
      jobId: job.id,
      jobTitle: job.title,
      message: `${vendorName}'s invoice (${formatMoney(s.actualAmount)}) has been unpaid ${daysOutstanding} days`,
    });
  }
  const unpaidMaterials = job.materialRequests.filter(
    (m) => m.status === "RECEIVED" && m.totalCost !== null && m.paidDate === null
  );
  for (const m of unpaidMaterials) {
    const anchor = m.receivedDate ?? m.createdAt;
    const daysOutstanding = Math.floor((now - anchor.getTime()) / DAY_MS);
    if (daysOutstanding < OVERDUE_WARNING_DAYS) continue;
    alerts.push({
      type: "AP_SEVERELY_OVERDUE",
      severity: daysOutstanding >= OVERDUE_CRITICAL_DAYS ? "critical" : "warning",
      jobId: job.id,
      jobTitle: job.title,
      message: `"${m.description}" (${formatMoney(m.totalCost ?? 0)}) has been unpaid ${daysOutstanding} days`,
    });
  }

  // Billing blocker — jobs at closeout that aren't actually ready to invoice.
  if (job.stage === "CLOSEOUT" || job.stage === "COMPLETE") {
    const readiness = await getBillingReadiness(companyId, job.id);
    if (!readiness.ready) {
      const failing = readiness.checks.filter((c) => !c.ok).map((c) => c.label);
      alerts.push({
        type: "BILLING_BLOCKER",
        severity: "warning",
        jobId: job.id,
        jobTitle: job.title,
        message: `Not ready to invoice: ${failing.join(", ")}`,
      });
    }
  }

  // Margin risk — trending below a healthy margin on jobs with a contract value.
  if (job.contractValue && job.contractValue > 0) {
    const costing = await getJobCosting(companyId, job.id);
    if (costing.projectedMarginPct !== null && costing.projectedMarginPct < MARGIN_WARNING_PCT) {
      alerts.push({
        type: "MARGIN_RISK",
        severity: costing.projectedMarginPct < 0 ? "critical" : "warning",
        jobId: job.id,
        jobTitle: job.title,
        message: `Projected margin ${(costing.projectedMarginPct * 100).toFixed(1)}%`,
      });
    }
  }

  return alerts;
}

export async function getAlerts(companyId: string): Promise<Alert[]> {
  const prisma = scopedPrisma(companyId);
  const jobs = await prisma.job.findMany({
    where: { status: { not: "CANCELLED" } },
    include: jobWithAlertIncludes,
  });

  const now = Date.now();
  const alerts: Alert[] = [];
  for (const job of jobs) {
    alerts.push(...(await computeJobAlerts(prisma, companyId, job, now)));
  }

  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}

/** Exceptions for a single job — same logic as getAlerts, scoped to one job
 * instead of scanning the whole company. Used by the job Command Center. */
export async function getJobAlerts(companyId: string, jobId: string): Promise<Alert[]> {
  const prisma = scopedPrisma(companyId);
  const job = await prisma.job.findFirst({
    where: { id: jobId },
    include: jobWithAlertIncludes,
  });
  if (!job) return [];

  const alerts = await computeJobAlerts(prisma, companyId, job, Date.now());
  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}
