import { scopedPrisma } from "@/lib/tenant";
import { getAlerts, type Alert, type AlertType } from "@/lib/alerts";
import { formatDate } from "@/lib/format";

export type CommandItem = Alert & {
  why: string;
  impact: string;
  action: string;
  actionHref: string;
  actionLabel: string;
  owner: string;
  dueLabel: string;
  pmUserId: string | null;
};

/** Category-level explanation of why this exception type matters — the
 * "why" a PM sees is stable per type; the specific magnitude/detail is
 * already in the alert's own message. */
const WHY: Record<AlertType, string> = {
  LABOR_OVERRUN: "Hours are running ahead of the estimate on a cost code — left alone, it erodes the job's margin.",
  SCHEDULE_RISK: "The project is behind where it needs to be against its target finish date.",
  MISSING_FIELD_REPORT: "Without a recent daily report, cost, schedule, and exceptions all go stale.",
  MATERIAL_RISK: "A material the crew needs hasn't arrived by when it was expected — it can stop work outright.",
  CREW_CONFLICT: "Someone's on the schedule board for this job without being formally assigned to it.",
  UNAPPROVED_CHANGE_WORK: "Extra work has been performed or identified but isn't priced/approved yet — it's not billable until it is.",
  BILLING_BLOCKER: "The job is at closeout but isn't actually ready to invoice.",
  MARGIN_RISK: "Projected profitability on this job has slipped below a healthy margin.",
  EQUIPMENT_ISSUE: "A piece of equipment is having a problem that can slow or stop the crew.",
  COI_EXPIRED: "A subcontractor's certificate of insurance has lapsed or is about to — a real compliance/liability gap.",
  PERMIT_EXPIRED: "The job's permit has lapsed or is about to — work can be stopped by the AHJ if it isn't current.",
  AR_SEVERELY_OVERDUE: "A pay application has gone unpaid well past normal collection time.",
  AP_SEVERELY_OVERDUE: "A sub or vendor is owed money well past normal payment terms.",
};

/** What happens if this exception is left unaddressed — the forward-looking
 * consequence, distinct from "why" (why this category matters generally). */
const IMPACT: Record<AlertType, string> = {
  LABOR_OVERRUN: "Margin keeps shrinking the longer this continues.",
  SCHEDULE_RISK: "Risk of missing the contracted finish date and the costs that come with it.",
  MISSING_FIELD_REPORT: "Job cost, schedule %, and exceptions are all out of date until this is filed.",
  MATERIAL_RISK: "The crew can be idle or blocked until this arrives.",
  CREW_CONFLICT: "Risk of a no-show, or a worker double-booked across two jobs on the same day.",
  UNAPPROVED_CHANGE_WORK: "Work already performed isn't in the contract value or billable yet.",
  BILLING_BLOCKER: "Can't invoice this job until it's cleared — cash collection is delayed.",
  MARGIN_RISK: "This job may finish at a loss or far below target profit.",
  EQUIPMENT_ISSUE: "Can slow or fully stop today's work if it's not addressed.",
  COI_EXPIRED: "Work performed without valid coverage exposes the company to uninsured claims.",
  PERMIT_EXPIRED: "Continuing work on an expired permit risks a stop-work order and re-inspection delays.",
  AR_SEVERELY_OVERDUE: "The longer this sits, the more it strains cash flow and the harder it gets to collect.",
  AP_SEVERELY_OVERDUE: "Risk of damaging the vendor/sub relationship or losing priority on future work.",
};

const ACTION: Record<AlertType, { label: string; text: string; href: (jobId: string) => string }> = {
  LABOR_OVERRUN: {
    label: "Review job cost",
    text: "Walk the cost code with the foreman — check crew pace, access, or rework driving the overrun.",
    href: (jobId) => `/jobs/${jobId}`,
  },
  SCHEDULE_RISK: {
    label: "Review schedule",
    text: "Confirm a revised finish date with the foreman; consider added crew or overtime to close the gap.",
    href: (jobId) => `/jobs/${jobId}`,
  },
  MISSING_FIELD_REPORT: {
    label: "Request today's report",
    text: "Get the foreman to submit today's (or the most recent) daily report.",
    href: (jobId) => `/jobs/${jobId}/daily-reports/new`,
  },
  MATERIAL_RISK: {
    label: "Chase the order",
    text: "Follow up with the vendor; consider expediting, substituting, or resequencing work around it.",
    href: (jobId) => `/jobs/${jobId}/materials`,
  },
  CREW_CONFLICT: {
    label: "Reconcile schedule",
    text: "Reconcile the schedule board against the job's formal crew assignment.",
    href: () => `/schedule`,
  },
  UNAPPROVED_CHANGE_WORK: {
    label: "Price & approve",
    text: "Price the change order and route it for approval so it's billable.",
    href: (jobId) => `/jobs/${jobId}/change-orders`,
  },
  BILLING_BLOCKER: {
    label: "Clear blockers",
    text: "Clear the failing billing-readiness checks before invoicing.",
    href: (jobId) => `/jobs/${jobId}`,
  },
  MARGIN_RISK: {
    label: "Review profitability",
    text: "Review scope creep, change-order pricing, and cost overruns driving the margin down.",
    href: (jobId) => `/jobs/${jobId}`,
  },
  EQUIPMENT_ISSUE: {
    label: "Address equipment",
    text: "Get the equipment serviced, swapped, or worked around before it costs more downtime.",
    href: (jobId) => `/jobs/${jobId}`,
  },
  COI_EXPIRED: {
    label: "Get a current COI",
    text: "Contact the subcontractor for an updated certificate of insurance before more work is performed.",
    href: (jobId) => `/jobs/${jobId}/subcontracts`,
  },
  PERMIT_EXPIRED: {
    label: "Renew the permit",
    text: "File for renewal or re-inspection with the permitting authority before more work is performed.",
    href: (jobId) => `/jobs/${jobId}/command-center/edit`,
  },
  AR_SEVERELY_OVERDUE: {
    label: "Follow up on payment",
    text: "Call the owner/GC's accounting contact and confirm what's blocking payment.",
    href: (jobId) => `/jobs/${jobId}/invoices`,
  },
  AP_SEVERELY_OVERDUE: {
    label: "Process payment",
    text: "Confirm the sub/vendor invoice is accurate and get it queued for payment.",
    href: (jobId) => `/jobs/${jobId}/subcontracts`,
  },
};

/** Alert types that are the foreman's problem to act on day-to-day, not the
 * PM's — used to pick a sensible default owner when a job has no PM set. */
const FOREMAN_OWNED: ReadonlySet<AlertType> = new Set(["MISSING_FIELD_REPORT", "CREW_CONFLICT", "EQUIPMENT_ISSUE"]);

function dueLabel(alert: Alert, job: { targetEndDate: Date | null } | undefined): string {
  if (alert.type === "SCHEDULE_RISK" && job?.targetEndDate) return formatDate(job.targetEndDate);
  if (alert.type === "MATERIAL_RISK") return "Overdue now";
  if (alert.type === "MISSING_FIELD_REPORT" || alert.type === "CREW_CONFLICT" || alert.type === "EQUIPMENT_ISSUE") return "Today";
  return "Ongoing";
}

/**
 * The PM's start-of-day view: every open exception across every job,
 * enriched with why it matters, its impact (the alert's own message already
 * states the magnitude), what to do about it, who owns it, and when it's
 * due — so "what needs my attention today" has a real answer instead of a
 * bare list. Built on top of getAlerts() rather than duplicating its logic.
 */
export async function getDailyCommand(companyId: string): Promise<CommandItem[]> {
  const alerts = await getAlerts(companyId);
  if (alerts.length === 0) return [];

  const prisma = scopedPrisma(companyId);
  const jobIds = Array.from(new Set(alerts.map((a) => a.jobId)));
  const jobs = await prisma.job.findMany({
    where: { id: { in: jobIds } },
    include: { pm: true, foreman: true },
  });
  const jobById = new Map(jobs.map((j) => [j.id, j]));

  return alerts.map((a) => {
    const job = jobById.get(a.jobId);
    const owner = FOREMAN_OWNED.has(a.type)
      ? job?.foreman?.name ?? job?.pm?.name ?? "Unassigned"
      : job?.pm?.name ?? job?.foreman?.name ?? "Unassigned";
    const action = ACTION[a.type];
    return {
      ...a,
      why: WHY[a.type],
      impact: IMPACT[a.type],
      action: action.text,
      actionLabel: action.label,
      actionHref: action.href(a.jobId),
      owner,
      dueLabel: dueLabel(a, job),
      pmUserId: job?.pmUserId ?? null,
    };
  });
}
