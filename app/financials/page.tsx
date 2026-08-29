import Link from "next/link";
import { getCompanyFinancials, type ProjectFinancials } from "@/lib/company-financials";
import { requireSession } from "@/lib/session";
import { canManageEstimates } from "@/lib/auth";
import { formatMoney, COST_CATEGORY_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

function pct(n: number | null, digits = 1): string {
  return n !== null ? `${(n * 100).toFixed(digits)}%` : "—";
}

function ProjectList({ title, projects, emptyText, valueLabel, valueFor }: {
  title: string;
  projects: ProjectFinancials[];
  emptyText: string;
  valueLabel: string;
  valueFor: (p: ProjectFinancials) => string;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium">{title} ({projects.length})</h2>
      {projects.length === 0 ? (
        <p className="text-slate-500 text-sm bg-white border rounded-lg p-4">{emptyText}</p>
      ) : (
        <div className="bg-white border rounded-lg divide-y">
          {projects.map((p) => (
            <Link key={p.jobId} href={`/jobs/${p.jobId}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
              <div>
                <div className="font-medium text-sm">{p.title}</div>
                <div className="text-xs text-slate-500 mt-0.5">{p.jobNumber}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">{valueLabel}</div>
                <div className="text-sm font-medium">{valueFor(p)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function FinancialsPage() {
  const session = await requireSession();
  if (!canManageEstimates(session.role)) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl font-semibold">Financials</h1>
        <p className="text-slate-500 text-sm mt-2">Only PM/ADMIN roles can view company-wide financials.</p>
      </div>
    );
  }

  const f = await getCompanyFinancials(session.companyId);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Company financials</h1>
          <p className="text-slate-500 text-sm mt-1">
            The operating financial view before accounting closes the month — original contract through approved
            change orders through projected final cost and margin, across every open project.
          </p>
        </div>
        <Link href="/accounting" className="text-sm text-blue-600 hover:underline whitespace-nowrap">
          Accounting handoff →
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Original contract", value: formatMoney(f.totals.originalContractValue) },
          { label: "+ Approved COs", value: formatMoney(f.totals.approvedChangeOrderValue) },
          { label: "= Current contract", value: formatMoney(f.totals.currentContractValue) },
          { label: "Total budget", value: formatMoney(f.totals.totalBudget) },
          { label: "Committed cost", value: formatMoney(f.totals.committedCost) },
          { label: "Actual cost", value: formatMoney(f.totals.actualCost) },
          { label: "Projected final cost", value: formatMoney(f.totals.projectedFinalCost) },
          {
            label: "Projected margin",
            value: pct(f.totals.projectedMarginPct),
            danger: f.totals.projectedMarginPct !== null && f.totals.projectedMarginPct < 0.1,
          },
        ].map((s) => (
          <div key={s.label} className="bg-white border rounded-lg p-4">
            <div className="text-xs text-slate-500">{s.label}</div>
            <div className={`text-xl font-semibold mt-1 ${s.danger ? "text-red-600" : ""}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-6 text-sm text-slate-600 bg-white border rounded-lg p-4">
        <span>Billing-ready value: <span className="font-medium text-slate-900">{formatMoney(f.totals.billingReadyValue)}</span></span>
        <span>Invoiced to date: <span className="font-medium text-slate-900">{formatMoney(f.totals.invoicedAmount)}</span></span>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">By cost category</h2>
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
              {f.categoryTotals.map((c) => (
                <tr key={c.category}>
                  <td className="px-4 py-3 font-medium">{COST_CATEGORY_LABEL[c.category]}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(c.estimated)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(c.committed)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(c.actual)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatMoney(c.projected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          Drill into a category from a project below, or open a project&apos;s own Command Center for its
          cost-code-level breakdown.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <ProjectList
          title="Losing margin"
          projects={f.losingMargin}
          emptyText="No open project is projected below a healthy margin."
          valueLabel="Projected margin"
          valueFor={(p) => pct(p.projectedMarginPct)}
        />
        <ProjectList
          title="Projected over budget"
          projects={f.overBudget}
          emptyText="No open project is projected to exceed its budget."
          valueLabel="Over budget by"
          valueFor={(p) => formatMoney(p.projectedFinalCost - p.totalBudget)}
        />
        <ProjectList
          title="Billing blocked"
          projects={f.billingBlocked}
          emptyText="Nothing at closeout is blocked from billing."
          valueLabel="Contract value"
          valueFor={(p) => formatMoney(p.currentContractValue)}
        />
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">All open projects</h2>
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium text-right">Contract</th>
                <th className="px-4 py-3 font-medium text-right">Budget</th>
                <th className="px-4 py-3 font-medium text-right">Committed</th>
                <th className="px-4 py-3 font-medium text-right">Actual</th>
                <th className="px-4 py-3 font-medium text-right">Proj. final cost</th>
                <th className="px-4 py-3 font-medium text-right">Proj. margin</th>
                <th className="px-4 py-3 font-medium">Billing</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {f.projects.map((p) => (
                <tr key={p.jobId} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/jobs/${p.jobId}`} className="font-medium hover:underline">{p.title}</Link>
                    <div className="text-xs text-slate-400">{p.jobNumber}</div>
                  </td>
                  <td className="px-4 py-3 text-right">{formatMoney(p.currentContractValue)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(p.totalBudget)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(p.committedCost)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(p.actualCost)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(p.projectedFinalCost)}</td>
                  <td className={`px-4 py-3 text-right ${p.projectedMarginPct !== null && p.projectedMarginPct < 0.1 ? "text-red-600 font-medium" : ""}`}>
                    {pct(p.projectedMarginPct)}
                  </td>
                  <td className="px-4 py-3">
                    {p.billingReady ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">Ready</span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
