import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { updateJobStatus, deleteJob } from "@/lib/actions";
import { computeProgress, PRODUCTIVITY_STATUS_LABEL, PRODUCTIVITY_STATUS_CLASSES } from "@/lib/productivity";
import { requireSession } from "@/lib/session";
import { canManageJobs, canManageEstimates } from "@/lib/auth";
import { getJobCosting } from "@/lib/job-costing";
import { getBillingReadiness } from "@/lib/billing";
import { getProjectHealth } from "@/lib/project-health";
import { ALERT_TYPE_LABEL } from "@/lib/alerts";
import { formatMoney, formatDate, PROJECT_STAGE_LABEL, COST_CATEGORY_LABEL } from "@/lib/format";
import { setJobBudget } from "@/lib/command-center-actions";
import { toggleChecklistItem, addChecklistItem } from "@/lib/checklist-actions";
import { pushJobToAccountingConnector } from "@/lib/accounting/sage-export-actions";
import { getSageConnection } from "@/lib/accounting/sage-tokens";
import { isAiConfigured } from "@/lib/ai/client";
import AskAiPanel from "./ask-ai";

const STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
const BUDGET_CATEGORIES = ["LABOR", "MATERIAL", "EQUIPMENT", "SUBCONTRACTOR", "OTHER"] as const;
const STAGES = ["PRECON", "MOBILIZATION", "ACTIVE", "PUNCH_LIST", "CLOSEOUT", "COMPLETE"] as const;

const STAGE_BADGE_CLASSES: Record<string, string> = {
  PRECON: "bg-slate-100 text-slate-700",
  MOBILIZATION: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700",
  PUNCH_LIST: "bg-amber-100 text-amber-700",
  CLOSEOUT: "bg-purple-100 text-purple-700",
  COMPLETE: "bg-slate-200 text-slate-700",
};

const SEVERITY_CLASSES: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  warning: "bg-amber-100 text-amber-700",
};

function pct(value: number | null, digits = 0): string {
  return value !== null ? `${(value * 100).toFixed(digits)}%` : "—";
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <div className="text-slate-500 text-xs">{label}</div>
      <div className={`font-medium ${danger ? "text-red-600" : ""}`}>{value}</div>
    </div>
  );
}

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ imported?: string; skipped?: string; accountingPush?: string; pushResult?: string }>;
}) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;
  const { imported, skipped, accountingPush, pushResult } = await searchParams;
  const sageConnection = await getSageConnection(session.companyId);

  // Resolve the job (and confirm it belongs to this company) before running
  // anything else — getJobCosting/getBillingReadiness use findFirstOrThrow
  // and would otherwise turn a cross-tenant id guess into a 500 instead of
  // a clean 404.
  const job = await prisma.job.findFirst({
    where: { id },
    include: { customer: true, assignments: { include: { worker: true } }, pm: true, foreman: true, division: true },
  });
  if (!job) notFound();

  const [jobCostCodes, costing, billing, health] = await Promise.all([
    prisma.jobCostCode.findMany({
      where: { jobId: id },
      include: { costCode: true, entries: { orderBy: { date: "desc" } } },
      orderBy: { costCode: { code: "asc" } },
    }),
    getJobCosting(session.companyId, id),
    getBillingReadiness(session.companyId, id),
    getProjectHealth(session.companyId, id),
  ]);
  const checklistItems = await prisma.jobChecklistItem.findMany({ where: { jobId: id }, orderBy: { createdAt: "asc" } });

  const canManage = canManageJobs(session.role);
  const canEstimate = canManageEstimates(session.role);

  async function setStatus(formData: FormData) {
    "use server";
    const status = formData.get("status");
    if (typeof status === "string") {
      await updateJobStatus(job!.id, status);
    }
  }

  async function removeJob() {
    "use server";
    await deleteJob(job!.id);
  }

  const laborVarianceLabel = `${health.laborHoursVariance >= 0 ? "+" : ""}${health.laborHoursVariance.toFixed(0)} hrs${
    health.laborHoursVariancePct !== null ? ` (${health.laborHoursVariancePct >= 0 ? "+" : ""}${(health.laborHoursVariancePct * 100).toFixed(0)}%)` : ""
  }`;
  const failingBillingChecks = health.billingReadiness.checks.filter((c) => !c.ok).length;
  const criticalExceptions = health.exceptions.filter((e) => e.severity === "critical").length;

  return (
    <div className="max-w-4xl space-y-6">
      {accountingPush && (
        <div className="max-w-2xl text-sm bg-green-50 border border-green-200 text-green-800 rounded-md px-4 py-3">
          Pushed to {accountingPush}. {pushResult}
        </div>
      )}

      {imported !== undefined && (
        <div className="max-w-2xl text-sm bg-green-50 border border-green-200 text-green-800 rounded-md px-4 py-3">
          Imported {imported} budget line{imported === "1" ? "" : "s"}.
          {skipped && (
            <span className="block mt-1 text-amber-700">
              Skipped (unmatched code or invalid numbers): {skipped}
            </span>
          )}
        </div>
      )}

      {/* Command Center — everything needed to understand project health at a glance */}
      <div className="bg-white border rounded-lg p-6 space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs text-slate-400 font-medium">{health.jobNumber}</div>
            <h1 className="text-2xl font-semibold">{health.title}</h1>
            <p className="text-slate-500 text-sm mt-1">
              {health.customerName ?? "No customer"}
              {health.location ? ` · ${health.location}` : ""}
              {job.division ? ` · ${job.division.name}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STAGE_BADGE_CLASSES[health.stage]}`}>
              {PROJECT_STAGE_LABEL[health.stage]}
            </span>
            {canManage && (
              <Link href={`/jobs/${job.id}/command-center/edit`} className="text-sm text-blue-600 hover:underline">
                Edit
              </Link>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-sm border-t pt-4">
          <Stat label="PM" value={health.pmName ?? "—"} />
          <Stat label="Foreman" value={health.foremanName ?? "—"} />
          <Stat label="Crew" value={health.crew.length > 0 ? health.crew.join(", ") : "—"} />
          <Stat label="Start date" value={formatDate(health.targetStartDate)} />
          <Stat label="Planned completion" value={formatDate(health.targetEndDate)} />
          <Stat
            label="Current day"
            value={health.currentDay && health.plannedDurationDays ? `Day ${health.currentDay} of ${health.plannedDurationDays}` : "—"}
          />
          <Stat label="Schedule %" value={pct(health.schedulePct)} />
          <Stat label="Production %" value={pct(health.productionPct)} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-sm border-t pt-4">
          <Stat label="Est. labor hours" value={health.estimatedLaborHours.toFixed(0)} />
          <Stat label="Actual labor hours" value={health.actualLaborHours.toFixed(0)} />
          <Stat
            label="Labor variance"
            value={laborVarianceLabel}
            danger={health.laborHoursVariancePct !== null && health.laborHoursVariancePct > 0.05}
          />
          <Stat label="Est. labor cost" value={formatMoney(health.estimatedLaborCost)} />
          <Stat label="Actual labor cost" value={formatMoney(health.actualLaborCost)} />
          <Stat label="Projected labor hrs" value={health.projectedLaborHours.toFixed(0)} />
          <Stat
            label="Projected labor cost"
            value={formatMoney(health.projectedLaborCost)}
            danger={health.projectedLaborCost > health.estimatedLaborCost * 1.15}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-sm border-t pt-4">
          <Stat label="Material budget" value={formatMoney(health.materialBudget)} />
          <Stat label="Material actual" value={formatMoney(health.materialActual)} />
          <Stat label="Equipment budget" value={formatMoney(health.equipmentBudget)} />
          <Stat label="Equipment actual" value={formatMoney(health.equipmentActual)} />
          <Stat label="Subcontractor budget" value={formatMoney(health.subcontractorBudget)} />
          <Stat label="Subcontractor actual" value={formatMoney(health.subcontractorActual)} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-sm border-t pt-4">
          <Stat label="Contract value" value={formatMoney(health.originalContractValue)} />
          <Stat
            label="Approved change orders"
            value={`${health.approvedChangeOrderCount} (${formatMoney(health.approvedChangeOrderRevenue)})`}
          />
          <div>
            <div className="text-slate-500 text-xs">Current contract value</div>
            <div className="font-medium">
              {formatMoney(health.currentContractValue)}{" "}
              <Link href={`/jobs/${job.id}/contract`} className="text-xs text-blue-600 hover:underline font-normal">
                (SOV)
              </Link>
            </div>
          </div>
          <Stat label="Projected final cost" value={formatMoney(health.projectedFinalCost)} />
          <Stat
            label="Projected gross profit"
            value={formatMoney(health.projectedGrossProfit)}
            danger={health.projectedGrossProfit < 0}
          />
          <Stat
            label="Projected margin"
            value={pct(health.projectedMarginPct, 1)}
            danger={(health.projectedMarginPct ?? 1) < 0.1}
          />
        </div>

        <div className="border-t pt-4 flex flex-wrap gap-8">
          <div>
            <div className="text-slate-500 text-xs mb-1">Billing readiness</div>
            <span
              className={`text-xs px-2 py-1 rounded-full font-medium ${
                health.billingReadiness.ready ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {health.billingReadiness.ready ? "Ready to invoice" : `Not ready — ${failingBillingChecks} open item${failingBillingChecks === 1 ? "" : "s"}`}
            </span>
          </div>
          <div className="flex-1 min-w-[240px]">
            <div className="text-slate-500 text-xs mb-1">
              Current exceptions ({health.exceptions.length}
              {criticalExceptions > 0 ? `, ${criticalExceptions} critical` : ""})
            </div>
            {health.exceptions.length === 0 ? (
              <span className="text-sm text-green-700">None — this project is clean</span>
            ) : (
              <ul className="space-y-1.5">
                {health.exceptions.slice(0, 4).map((e, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${SEVERITY_CLASSES[e.severity]}`}>
                      {ALERT_TYPE_LABEL[e.type]}
                    </span>
                    <span className="text-slate-600">{e.message}</span>
                  </li>
                ))}
                {health.exceptions.length > 4 && (
                  <li className="text-xs text-slate-400">+{health.exceptions.length - 4} more</li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Sub-workflow links */}
      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href={`/jobs/${job.id}/daily-reports/new`}
          className="bg-slate-900 text-white rounded-md px-3 py-1.5 hover:bg-slate-700"
        >
          + Daily update
        </Link>
        <Link href={`/jobs/${job.id}/daily-reports`} className="bg-white border rounded-md px-3 py-1.5 hover:bg-slate-50">
          Daily reports
        </Link>
        <Link href={`/jobs/${job.id}/materials`} className="bg-white border rounded-md px-3 py-1.5 hover:bg-slate-50">
          Materials
        </Link>
        <Link href={`/jobs/${job.id}/change-orders`} className="bg-white border rounded-md px-3 py-1.5 hover:bg-slate-50">
          Change orders
        </Link>
        <Link href="/equipment" className="bg-white border rounded-md px-3 py-1.5 hover:bg-slate-50">
          Equipment
        </Link>
        <Link href={`/jobs/${job.id}/contract`} className="bg-white border rounded-md px-3 py-1.5 hover:bg-slate-50">
          Contract &amp; SOV
        </Link>
        <Link href={`/jobs/${job.id}/subcontracts`} className="bg-white border rounded-md px-3 py-1.5 hover:bg-slate-50">
          Subcontracts
        </Link>
        <Link href={`/jobs/${job.id}/invoices`} className="bg-white border rounded-md px-3 py-1.5 hover:bg-slate-50">
          Invoices
        </Link>
        <Link href={`/jobs/${job.id}/documents`} className="bg-white border rounded-md px-3 py-1.5 hover:bg-slate-50">
          Documents
        </Link>
        <Link href={`/jobs/${job.id}/activity`} className="bg-white border rounded-md px-3 py-1.5 hover:bg-slate-50">
          Activity
        </Link>
        {canEstimate && (
          <a
            href={`/api/jobs/${job.id}/accounting-export`}
            className="bg-white border rounded-md px-3 py-1.5 hover:bg-slate-50"
          >
            Export to accounting (CSV)
          </a>
        )}
        {canEstimate && sageConnection && (
          <form action={pushJobToAccountingConnector} className="inline">
            <input type="hidden" name="jobId" value={job.id} />
            <button type="submit" className="bg-white border rounded-md px-3 py-1.5 hover:bg-slate-50">
              Push to Sage Intacct
            </button>
          </form>
        )}
      </div>

      {/* Checklist — automation-generated on stage entry, plus manual items */}
      <div className="space-y-3">
        <h2 className="text-lg font-medium">Checklist</h2>
          {checklistItems.length === 0 ? (
            <p className="text-slate-500 text-sm">No checklist items yet.</p>
          ) : (
            <div className="bg-white border rounded-lg divide-y">
              {checklistItems.map((item) => (
                <form
                  key={item.id}
                  action={toggleChecklistItem}
                  className="px-4 py-2 flex items-center gap-3 text-sm"
                >
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="jobId" value={job.id} />
                  <input type="hidden" name="done" value={item.done ? "" : "on"} />
                  <button
                    type="submit"
                    className={`w-4 h-4 rounded border flex-shrink-0 ${item.done ? "bg-slate-900 border-slate-900" : "border-slate-300"}`}
                    aria-label={item.done ? "Mark not done" : "Mark done"}
                  />
                  <span className={item.done ? "line-through text-slate-400" : ""}>{item.title}</span>
                  <span className="ml-auto text-xs text-slate-400">
                    {PROJECT_STAGE_LABEL[item.stage]} · {item.source === "AUTOMATED" ? "auto" : "manual"}
                  </span>
                </form>
              ))}
            </div>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700">+ Add checklist item</summary>
            <form action={addChecklistItem} className="mt-2 flex flex-wrap items-end gap-2 bg-white border rounded-lg p-4">
              <input type="hidden" name="jobId" value={job.id} />
              <div>
                <label className="block text-xs font-medium mb-1">Stage</label>
                <select name="stage" defaultValue={job.stage} className="border rounded-md px-2 py-1 text-sm">
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {PROJECT_STAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium mb-1">Title</label>
                <input name="title" required className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <button type="submit" className="bg-slate-900 text-white text-sm px-3 py-2 rounded-md hover:bg-slate-700">
                Add
              </button>
            </form>
          </details>
      </div>

      {/* Job costing */}
      <div className="space-y-3">
        <h2 className="text-lg font-medium">Job costing</h2>
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium text-right">Estimated</th>
                <th className="px-4 py-3 font-medium text-right">Committed</th>
                <th className="px-4 py-3 font-medium text-right">Actual</th>
                <th className="px-4 py-3 font-medium text-right">Projected</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {costing.categories.map((c) => (
                <tr key={c.category}>
                  <td className="px-4 py-3 font-medium">{COST_CATEGORY_LABEL[c.category]}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(c.estimated)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(c.committed)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(c.actual)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(c.projected)}</td>
                </tr>
              ))}
              <tr className="font-medium bg-slate-50">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">{formatMoney(costing.totalEstimated)}</td>
                <td className="px-4 py-3 text-right">{formatMoney(costing.totalCommitted)}</td>
                <td className="px-4 py-3 text-right">{formatMoney(costing.totalActual)}</td>
                <td className="px-4 py-3 text-right">{formatMoney(costing.totalProjected)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-white border rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-slate-500">Change order revenue</div>
            <div className="font-medium">{formatMoney(costing.changeOrderRevenue)}</div>
          </div>
          <div>
            <div className="text-slate-500">Projected final cost</div>
            <div className="font-medium">{formatMoney(costing.projectedFinalCost)}</div>
          </div>
          <div>
            <div className="text-slate-500">Projected gross profit</div>
            <div className={`font-medium ${costing.projectedGrossProfit < 0 ? "text-red-600" : ""}`}>
              {formatMoney(costing.projectedGrossProfit)}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Projected margin</div>
            <div className={`font-medium ${(costing.projectedMarginPct ?? 1) < 0.1 ? "text-red-600" : ""}`}>
              {costing.projectedMarginPct !== null ? `${(costing.projectedMarginPct * 100).toFixed(1)}%` : "—"}
            </div>
          </div>
        </div>

        {canEstimate && (
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700">Set a category budget</summary>
            <form action={setJobBudget} className="mt-2 flex flex-wrap items-end gap-3 bg-white border rounded-lg p-4">
              <input type="hidden" name="jobId" value={job.id} />
              <div>
                <label className="block text-xs font-medium mb-1">Category</label>
                <select name="category" className="border rounded-md px-3 py-2 text-sm">
                  {BUDGET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {COST_CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Estimated amount</label>
                <input name="estimatedAmount" type="number" step="any" min="0" required className="border rounded-md px-3 py-2 text-sm" />
              </div>
              <button type="submit" className="bg-slate-900 text-white text-sm px-3 py-2 rounded-md hover:bg-slate-700">
                Save budget
              </button>
            </form>
          </details>
        )}
      </div>

      {/* Billing readiness */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium">Billing readiness</h2>
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              billing.ready ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {billing.ready ? "Ready to invoice" : "Not ready"}
          </span>
        </div>
        <div className="bg-white border rounded-lg divide-y">
          {billing.checks.map((c) => (
            <div key={c.key} className="px-4 py-3 flex items-center justify-between text-sm">
              <div>
                <div className="font-medium">{c.label}</div>
                <div className="text-slate-500 text-xs">{c.detail}</div>
              </div>
              <span className={c.ok ? "text-green-600" : "text-red-600"}>{c.ok ? "✓" : "✗"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-2xl bg-white border rounded-lg p-6 space-y-4">
        {job.description && (
          <div>
            <div className="text-sm font-medium text-slate-500">Description</div>
            <p className="text-sm">{job.description}</p>
          </div>
        )}
        {job.address && (
          <div>
            <div className="text-sm font-medium text-slate-500">Address</div>
            <p className="text-sm">{job.address}</p>
          </div>
        )}
        {job.scheduledAt && (
          <div>
            <div className="text-sm font-medium text-slate-500">Scheduled</div>
            <p className="text-sm">{new Date(job.scheduledAt).toLocaleString()}</p>
          </div>
        )}
        <div>
          <div className="text-sm font-medium text-slate-500">Assigned workers</div>
          {job.assignments.length === 0 ? (
            <p className="text-sm text-slate-500">None assigned</p>
          ) : (
            <ul className="text-sm list-disc list-inside">
              {job.assignments.map((a) => (
                <li key={a.id}>
                  {a.worker.name} {a.worker.role && `(${a.worker.role})`}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="text-sm font-medium text-slate-500 mb-1">Status</div>
          <form action={setStatus} className="flex items-center gap-2">
            <select
              name="status"
              defaultValue={job.status}
              className="border rounded-md px-3 py-2 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="bg-slate-900 text-white text-sm px-3 py-2 rounded-md hover:bg-slate-700"
            >
              Update
            </button>
          </form>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">Labor productivity</h2>
            <p className="text-xs text-slate-500">
              Hours and quantity come from the crew&apos;s{" "}
              <Link href={`/jobs/${job.id}/daily-reports/new`} className="text-blue-600 hover:underline">
                daily report
              </Link>{" "}
              — there&apos;s no separate production log to fill out.
            </p>
          </div>
          {canEstimate && (
            <div className="flex gap-3 text-sm flex-shrink-0">
              <Link href={`/jobs/${job.id}/cost-codes/new`} className="text-blue-600 hover:underline">
                + Add budget line
              </Link>
              <Link href={`/jobs/${job.id}/cost-codes/import`} className="text-blue-600 hover:underline">
                Import CSV
              </Link>
            </div>
          )}
        </div>

        {jobCostCodes.length === 0 ? (
          <p className="text-slate-500 text-sm">
            No cost code budgets yet. Add one to start tracking actual vs. estimated
            productivity for this job.
          </p>
        ) : (
          <div className="bg-white border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="px-4 py-3 font-medium">Cost code</th>
                  <th className="px-4 py-3 font-medium text-right">Est qty</th>
                  <th className="px-4 py-3 font-medium text-right">Actual qty</th>
                  <th className="px-4 py-3 font-medium text-right">Est hrs</th>
                  <th className="px-4 py-3 font-medium text-right">Actual hrs</th>
                  <th className="px-4 py-3 font-medium text-right">Projected hrs</th>
                  <th className="px-4 py-3 font-medium text-right">Est rate</th>
                  <th className="px-4 py-3 font-medium text-right">Actual rate</th>
                  <th className="px-4 py-3 font-medium text-right">Variance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {jobCostCodes.map((jcc) => {
                  const progress = computeProgress(jcc.estimatedQty, jcc.estimatedHours, jcc.entries);
                  return (
                    <tr key={jcc.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium">{jcc.costCode.code}</div>
                        <div className="text-slate-500 text-xs">
                          {jcc.costCode.description} ({jcc.costCode.unit})
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">{jcc.estimatedQty}</td>
                      <td className="px-4 py-3 text-right">{progress.actualQty || "—"}</td>
                      <td className="px-4 py-3 text-right">{jcc.estimatedHours}</td>
                      <td className="px-4 py-3 text-right">{progress.actualHours || "—"}</td>
                      <td className="px-4 py-3 text-right">{progress.projectedHours.toFixed(1)}</td>
                      <td className="px-4 py-3 text-right">
                        {progress.estimatedRate !== null ? progress.estimatedRate.toFixed(2) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {progress.actualRate !== null ? progress.actualRate.toFixed(2) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {progress.hoursVariancePct !== null
                          ? `${progress.hoursVariancePct >= 0 ? "+" : ""}${(
                              progress.hoursVariancePct * 100
                            ).toFixed(0)}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${PRODUCTIVITY_STATUS_CLASSES[progress.status]}`}
                        >
                          {PRODUCTIVITY_STATUS_LABEL[progress.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {jobCostCodes.some((jcc) => jcc.entries.length > 0) && (
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
              Daily production log
            </summary>
            <div className="bg-white border rounded-lg divide-y mt-2">
              {jobCostCodes
                .flatMap((jcc) =>
                  jcc.entries.map((e) => ({ ...e, costCode: jcc.costCode }))
                )
                .sort((a, b) => b.date.getTime() - a.date.getTime())
                .map((e) => (
                  <div key={e.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">
                        {e.costCode.code} — {new Date(e.date).toLocaleDateString()}
                      </div>
                      <div className="text-slate-500 text-xs">
                        {e.hours} hrs · {e.quantity} {e.costCode.unit}
                        {e.crewSize ? ` · crew of ${e.crewSize}` : ""}
                        {e.notes ? ` · ${e.notes}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </details>
        )}
      </div>

      {isAiConfigured() && <AskAiPanel jobId={job.id} />}

      {canManage && (
        <form action={removeJob}>
          <button
            type="submit"
            className="text-sm text-red-600 hover:underline"
          >
            Delete job
          </button>
        </form>
      )}
    </div>
  );
}
