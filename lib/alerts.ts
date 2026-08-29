import { scopedPrisma } from "@/lib/tenant";
import { computeProgress } from "@/lib/productivity";
import { getJobCosting } from "@/lib/job-costing";
import { getBillingReadiness } from "@/lib/billing";

export type AlertType =
  | "LABOR_OVERRUN"
  | "SCHEDULE_RISK"
  | "MISSING_FIELD_REPORT"
  | "MATERIAL_RISK"
  | "CREW_CONFLICT"
  | "UNAPPROVED_CHANGE_WORK"
  | "BILLING_BLOCKER"
  | "MARGIN_RISK";

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
};

const DAY_MS = 86_400_000;
const MARGIN_WARNING_PCT = 0.1;

export async function getAlerts(companyId: string): Promise<Alert[]> {
  const prisma = scopedPrisma(companyId);
  const jobs = await prisma.job.findMany({
    where: { status: { not: "CANCELLED" } },
    include: {
      assignments: true,
      costCodes: { include: { entries: true } },
      scheduleAssignments: true,
      dailyReports: { orderBy: { date: "desc" }, take: 1 },
      materialRequests: true,
      changeOrders: true,
    },
  });

  const alerts: Alert[] = [];
  const now = Date.now();

  for (const job of jobs) {
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

    // Unapproved change work — field flagged a change condition, no change order created yet.
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
    const pendingCOs = job.changeOrders.filter((co) => co.status === "SUBMITTED");
    for (const co of pendingCOs) {
      alerts.push({
        type: "UNAPPROVED_CHANGE_WORK",
        severity: "warning",
        jobId: job.id,
        jobTitle: job.title,
        message: `Change order "${co.title}" is submitted and awaiting approval`,
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
  }

  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}
