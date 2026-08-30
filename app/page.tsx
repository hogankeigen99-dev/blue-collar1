import Link from "next/link";
import { redirect } from "next/navigation";
import { getCompanyCommand, type JobRef } from "@/lib/company-command";
import { requireSession } from "@/lib/session";
import { ALERT_TYPE_LABEL } from "@/lib/alerts";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

function pct(n: number | null, digits = 1): string {
  return n !== null ? `${(n * 100).toFixed(digits)}%` : "—";
}

function StatTile({ label, value, sub, danger, href }: { label: string; value: string; sub?: string; danger?: boolean; href?: string }) {
  const body = (
    <div className={`bg-white border rounded-lg p-4 h-full ${href ? "hover:border-slate-400 transition-colors" : ""}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${danger ? "text-red-600" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function RiskBucket({ title, jobs, emptyText, riskParam }: { title: string; jobs: JobRef[]; emptyText: string; riskParam?: string }) {
  return (
    <div className="bg-white border rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-medium text-sm">{title}</div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${jobs.length > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
          {jobs.length}
        </span>
      </div>
      {jobs.length === 0 ? (
        <p className="text-xs text-slate-400">{emptyText}</p>
      ) : (
        <div className="space-y-1">
          {jobs.slice(0, 4).map((j) => (
            <Link key={j.jobId} href={`/jobs/${j.jobId}`} className="block text-xs hover:underline">
              <span className="font-medium">{j.title}</span> — <span className="text-slate-500">{j.detail}</span>
            </Link>
          ))}
          {jobs.length > 4 && riskParam && (
            <Link href={`/projects?risk=${riskParam}`} className="block text-xs text-blue-600 hover:underline pt-0.5">
              +{jobs.length - 4} more →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export default async function CompanyCommandCenter({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireSession();
  const { view } = await searchParams;

  if (session.role === "FOREMAN") {
    redirect("/field");
  }
  // A PM's home is their own Action Center (below), not the company-wide
  // executive rollup — same reasoning as the FOREMAN redirect above, just
  // one role up. "Command" in the nav still reaches this page explicitly
  // via ?view=command (see app/layout.tsx) for a PM who wants to check
  // overall company health.
  if (session.role === "PM" && view !== "command") {
    redirect("/today");
  }

  const cmd = await getCompanyCommand(session.companyId);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Company command</h1>
        <p className="text-slate-500 text-sm mt-1">
          How is the company doing right now — every number below is computed live from the same records each
          project&apos;s own Command Center shows, not typed in separately. Click through to see where it comes
          from.
        </p>
      </div>

      {/* Pipeline */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Pipeline</h2>
          <Link href="/opportunities" className="text-sm text-blue-600 hover:underline">
            Full pipeline →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="Open opportunities" value={String(cmd.pipelineOpenCount)} href="/opportunities" />
          <StatTile label="Pipeline value" value={formatMoney(cmd.pipelineValue)} href="/opportunities" />
          <StatTile label="Win rate" value={pct(cmd.pipelineWinRatePct)} href="/opportunities" />
        </div>
      </div>

      {/* Cash */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Cash</h2>
          <Link href="/cash" className="text-sm text-blue-600 hover:underline">
            AR/AP aging & forecast →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="AR outstanding" value={formatMoney(cmd.cashArOutstanding)} href="/cash" />
          <StatTile label="AP outstanding" value={formatMoney(cmd.cashApOutstanding)} href="/cash" />
          <StatTile
            label="Net position"
            value={formatMoney(cmd.cashNetPosition)}
            href="/cash"
            danger={cmd.cashNetPosition < 0}
          />
        </div>
      </div>

      {/* Active operations */}
      <div className="space-y-3">
        <h2 className="text-lg font-medium">Active operations</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile label="Active projects" value={String(cmd.activeProjectCount)} href="/projects" />
          <RiskBucket title="Starting soon" jobs={cmd.startingSoon} emptyText="Nothing starting in the next 7 days." />
          <RiskBucket title="Nearing completion" jobs={cmd.nearingCompletion} emptyText="Nothing finishing in the next 7 days." />
          <RiskBucket title="Behind schedule" jobs={cmd.behindSchedule} emptyText="No schedule-risk projects." riskParam="schedule" />
          <RiskBucket title="Labor risk" jobs={cmd.laborRisk} emptyText="No labor-overrun projects." riskParam="labor" />
          <RiskBucket title="Margin risk" jobs={cmd.marginRisk} emptyText="No margin-risk projects." riskParam="margin" />
          <RiskBucket title="Material risk" jobs={cmd.materialRisk} emptyText="Nothing overdue." />
          <RiskBucket title="Equipment issues" jobs={cmd.equipmentIssues} emptyText="No equipment issues flagged." />
          <RiskBucket title="Unresolved change work" jobs={cmd.unresolvedChangeWork} emptyText="No unapproved change work." />
        </div>
      </div>

      {/* Financial performance */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Financial performance</h2>
          <Link href="/financials" className="text-sm text-blue-600 hover:underline">
            Full financial view →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Original contract" value={formatMoney(cmd.originalContractValue)} href="/financials" />
          <StatTile label="+ Approved change orders" value={formatMoney(cmd.approvedChangeOrderValue)} href="/financials" />
          <StatTile label="= Current contract" value={formatMoney(cmd.currentContractValue)} href="/financials" />
          <StatTile label="Total budget" value={formatMoney(cmd.totalBudget)} href="/financials" />
          <StatTile label="Committed cost" value={formatMoney(cmd.committedCost)} href="/financials" />
          <StatTile label="Actual cost" value={formatMoney(cmd.actualCost)} href="/financials" />
          <StatTile label="Projected final cost" value={formatMoney(cmd.projectedFinalCost)} href="/financials" />
          <StatTile
            label="Projected gross margin"
            value={pct(cmd.projectedGrossMarginPct)}
            sub={`Gross profit ${formatMoney(cmd.projectedGrossProfit)}`}
            danger={cmd.projectedGrossMarginPct !== null && cmd.projectedGrossMarginPct < 0.1}
            href="/financials"
          />
          <StatTile
            label="Billing-ready value"
            value={formatMoney(cmd.billingReadyValue)}
            sub={`${cmd.billingReadyCount} project(s)`}
            href="/financials"
          />
          <StatTile label="Invoiced to date" value={formatMoney(cmd.invoicedAmount)} href="/financials" />
          <StatTile
            label="Open change-order exposure"
            value={formatMoney(cmd.openChangeOrderExposure)}
            sub={`${cmd.openChangeOrderCount} pending`}
            href="/projects?risk=schedule"
          />
        </div>
      </div>

      {/* Labor */}
      <div className="space-y-3">
        <h2 className="text-lg font-medium">Labor</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Estimated labor hours" value={cmd.estimatedLaborHours.toFixed(0)} href="/cost-codes" />
          <StatTile label="Actual labor hours" value={cmd.actualLaborHours.toFixed(0)} href="/cost-codes" />
          <StatTile label="Projected final labor hours" value={cmd.projectedLaborHours.toFixed(0)} href="/cost-codes" />
          <StatTile
            label="Labor variance"
            value={`${cmd.laborVarianceHours >= 0 ? "+" : ""}${cmd.laborVarianceHours.toFixed(0)} hrs`}
            sub={cmd.laborVariancePct !== null ? pct(cmd.laborVariancePct) : undefined}
            danger={cmd.laborVariancePct !== null && cmd.laborVariancePct > 0.1}
            href="/projects?risk=labor"
          />
          <StatTile
            label="Projects over productivity"
            value={String(cmd.projectsOverProductivity)}
            href="/projects?risk=labor"
          />
          <StatTile
            label="Company productivity trend"
            value={
              cmd.productivityTrend.recentAvgVariancePct !== null
                ? `${cmd.productivityTrend.recentAvgVariancePct >= 0 ? "+" : ""}${pct(cmd.productivityTrend.recentAvgVariancePct)}`
                : "Not enough history"
            }
            sub={
              cmd.productivityTrend.priorAvgVariancePct !== null
                ? `vs. ${cmd.productivityTrend.priorAvgVariancePct >= 0 ? "+" : ""}${pct(cmd.productivityTrend.priorAvgVariancePct)} prior period`
                : "Last 90 days of completed-job benchmarks"
            }
            href="/cost-codes"
          />
        </div>
      </div>

      {/* Resources */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Resources</h2>
          <Link href="/company/resources" className="text-sm text-blue-600 hover:underline">
            Resource command →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Active crews" value={String(cmd.activeCrewCount)} href="/company/resources" />
          <StatTile
            label="Crew utilization"
            value={pct(cmd.crewUtilizationPct, 0)}
            sub={`${cmd.workersAssignedToday}/${cmd.workersAvailableToday} available`}
            href="/company/resources"
          />
          <StatTile label="Workers assigned today" value={String(cmd.workersAssignedToday)} href="/company/resources" />
          <StatTile
            label="Workers available today"
            value={String(cmd.workersAvailableToday)}
            sub={`${cmd.totalActiveWorkers} active total`}
            href="/company/resources"
          />
          <StatTile label="Equipment assigned" value={String(cmd.equipmentAssignedCount)} href="/company/resources" />
          <StatTile
            label="Equipment conflicts"
            value={String(cmd.equipmentConflictCount)}
            danger={cmd.equipmentConflictCount > 0}
            href="/company/resources"
          />
        </div>
      </div>

      {/* Top exceptions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Top exceptions</h2>
          <Link href="/today" className="text-sm text-blue-600 hover:underline">
            Full action center →
          </Link>
        </div>
        {cmd.topExceptions.length === 0 ? (
          <p className="text-slate-500 text-sm bg-white border rounded-lg p-6">Nothing needs attention — every project is clean.</p>
        ) : (
          <div className="bg-white border rounded-lg divide-y">
            {cmd.topExceptions.map((e, i) => (
              <Link key={`${e.jobId}-${e.type}-${i}`} href={`/jobs/${e.jobId}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                <div>
                  <div className="font-medium text-sm">{e.jobTitle}</div>
                  <div className="text-sm text-slate-500">{e.message}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-slate-400 whitespace-nowrap">{formatMoney(e.contractValue)}</span>
                  <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${e.severity === "critical" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                    {ALERT_TYPE_LABEL[e.type]}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
