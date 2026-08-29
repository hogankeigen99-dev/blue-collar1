import Link from "next/link";
import { scopedPrisma } from "@/lib/tenant";
import { getProjectPortfolio, type PortfolioRow, type PortfolioFilters } from "@/lib/portfolio";
import { requireSession } from "@/lib/session";
import { formatMoney, formatDate, PROJECT_STAGE_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

const RISK_CLASSES: Record<PortfolioRow["riskLevel"], string> = {
  critical: "bg-red-100 text-red-700",
  watch: "bg-amber-100 text-amber-700",
  none: "bg-green-100 text-green-700",
};
const RISK_LABEL: Record<PortfolioRow["riskLevel"], string> = {
  critical: "At risk",
  watch: "Watch",
  none: "Healthy",
};

type SortKey = "finish" | "value" | "margin" | "laborVariance";
const SORTERS: Record<SortKey, (a: PortfolioRow, b: PortfolioRow) => number> = {
  finish: (a, b) => (a.targetEndDate?.getTime() ?? Infinity) - (b.targetEndDate?.getTime() ?? Infinity),
  value: (a, b) => b.currentContractValue - a.currentContractValue,
  margin: (a, b) => (a.projectedMarginPct ?? 1) - (b.projectedMarginPct ?? 1),
  laborVariance: (a, b) => (b.laborHoursVariancePct ?? -1) - (a.laborHoursVariancePct ?? -1),
};

function pct(n: number | null, digits = 0): string {
  return n !== null ? `${(n * 100).toFixed(digits)}%` : "—";
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    pmUserId?: string;
    foremanWorkerId?: string;
    projectType?: string;
    stage?: string;
    risk?: string;
    includeComplete?: string;
    sort?: string;
  }>;
}) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const sp = await searchParams;

  const filters: PortfolioFilters = {
    pmUserId: sp.pmUserId || undefined,
    foremanWorkerId: sp.foremanWorkerId || undefined,
    projectType: sp.projectType || undefined,
    risk: (sp.risk as PortfolioFilters["risk"]) || undefined,
    includeComplete: sp.includeComplete === "1",
  };

  const [rows, pmUsers, foremen, projectTypeRows] = await Promise.all([
    getProjectPortfolio(session.companyId, filters),
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "PM"] }, active: true }, orderBy: { name: "asc" } }),
    prisma.worker.findMany({ where: { active: true, foremanForJobs: { some: {} } }, orderBy: { name: "asc" } }),
    prisma.job.findMany({ where: { projectType: { not: null } }, select: { projectType: true }, distinct: ["projectType"] }),
  ]);

  const stageFiltered = sp.stage ? rows.filter((r) => r.stage === sp.stage) : rows;
  const sortKey = (sp.sort as SortKey) ?? "finish";
  const sorted = [...stageFiltered].sort(SORTERS[sortKey] ?? SORTERS.finish);
  const projectTypes = projectTypeRows.map((r) => r.projectType!).sort();
  const hasActiveFilters = Object.entries(sp).some(([k, v]) => k !== "sort" && v);

  const totals = {
    contractValue: sorted.reduce((s, r) => s + r.currentContractValue, 0),
    projectedProfit: sorted.reduce((s, r) => s + r.projectedGrossProfit, 0),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Project portfolio</h1>
        <p className="text-slate-500 text-sm mt-1">
          Every project&apos;s operating health at a glance — the same numbers each job&apos;s own Command Center
          shows, not a separate calculation. Click a row to open it.
        </p>
      </div>

      <form method="GET" className="bg-white border rounded-lg p-4 flex flex-wrap items-end gap-3 text-sm">
        <div>
          <label className="block text-xs font-medium mb-1">PM</label>
          <select name="pmUserId" defaultValue={sp.pmUserId ?? ""} className="border rounded-md px-2 py-1.5">
            <option value="">— Any —</option>
            {pmUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Foreman</label>
          <select name="foremanWorkerId" defaultValue={sp.foremanWorkerId ?? ""} className="border rounded-md px-2 py-1.5">
            <option value="">— Any —</option>
            {foremen.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Project type</label>
          <select name="projectType" defaultValue={sp.projectType ?? ""} className="border rounded-md px-2 py-1.5">
            <option value="">— Any —</option>
            {projectTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Stage</label>
          <select name="stage" defaultValue={sp.stage ?? ""} className="border rounded-md px-2 py-1.5">
            <option value="">— Any —</option>
            {Object.entries(PROJECT_STAGE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Risk</label>
          <select name="risk" defaultValue={sp.risk ?? ""} className="border rounded-md px-2 py-1.5">
            <option value="">— Any —</option>
            <option value="schedule">Schedule risk</option>
            <option value="labor">Labor risk</option>
            <option value="margin">Margin risk</option>
            <option value="billing_blocked">Billing blocked</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Sort by</label>
          <select name="sort" defaultValue={sp.sort ?? "finish"} className="border rounded-md px-2 py-1.5">
            <option value="finish">Target finish (soonest)</option>
            <option value="value">Contract value (highest)</option>
            <option value="margin">Margin (lowest first)</option>
            <option value="laborVariance">Labor variance (worst first)</option>
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-xs pb-1.5">
          <input type="checkbox" name="includeComplete" value="1" defaultChecked={sp.includeComplete === "1"} />
          Include completed
        </label>
        <button type="submit" className="bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-700">
          Apply
        </button>
        {hasActiveFilters && (
          <Link href="/projects" className="text-blue-600 hover:underline">
            Clear
          </Link>
        )}
      </form>

      <div className="flex gap-6 text-sm text-slate-600">
        <span>{sorted.length} project(s)</span>
        <span>Total contract value {formatMoney(totals.contractValue)}</span>
        <span>Total projected profit {formatMoney(totals.projectedProfit)}</span>
      </div>

      {sorted.length === 0 ? (
        <p className="text-slate-500 text-sm bg-white border rounded-lg p-6">No projects match these filters.</p>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-3 py-3 font-medium">Project</th>
                <th className="px-3 py-3 font-medium">Customer</th>
                <th className="px-3 py-3 font-medium">PM / Foreman</th>
                <th className="px-3 py-3 font-medium">Stage</th>
                <th className="px-3 py-3 font-medium">Finish</th>
                <th className="px-3 py-3 font-medium text-right">Contract value</th>
                <th className="px-3 py-3 font-medium text-right">Schedule %</th>
                <th className="px-3 py-3 font-medium text-right">Production %</th>
                <th className="px-3 py-3 font-medium text-right">Labor var.</th>
                <th className="px-3 py-3 font-medium text-right">Proj. final cost</th>
                <th className="px-3 py-3 font-medium text-right">Proj. margin</th>
                <th className="px-3 py-3 font-medium text-right">Open CO</th>
                <th className="px-3 py-3 font-medium">Billing</th>
                <th className="px-3 py-3 font-medium">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((r) => (
                <tr key={r.jobId} className="hover:bg-slate-50">
                  <td className="px-3 py-3">
                    <Link href={`/jobs/${r.jobId}`} className="font-medium hover:underline">
                      {r.title}
                    </Link>
                    <div className="text-xs text-slate-400">{r.jobNumber}{r.projectType ? ` · ${r.projectType}` : ""}</div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{r.customerName ?? "—"}</td>
                  <td className="px-3 py-3 text-slate-600">
                    <div>{r.pmName ?? "—"}</div>
                    <div className="text-xs text-slate-400">{r.foremanName ?? "—"}</div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{PROJECT_STAGE_LABEL[r.stage] ?? r.stage}</td>
                  <td className="px-3 py-3 text-slate-600">{formatDate(r.targetEndDate)}</td>
                  <td className="px-3 py-3 text-right font-medium">{formatMoney(r.currentContractValue)}</td>
                  <td className="px-3 py-3 text-right">{pct(r.schedulePct)}</td>
                  <td className="px-3 py-3 text-right">{pct(r.productionPct)}</td>
                  <td className={`px-3 py-3 text-right ${r.laborRisk ? "text-red-600 font-medium" : ""}`}>
                    {r.laborHoursVariancePct !== null ? `${r.laborHoursVariancePct >= 0 ? "+" : ""}${pct(r.laborHoursVariancePct)}` : "—"}
                  </td>
                  <td className="px-3 py-3 text-right">{formatMoney(r.projectedFinalCost)}</td>
                  <td className={`px-3 py-3 text-right ${r.marginRisk ? "text-red-600 font-medium" : ""}`}>{pct(r.projectedMarginPct, 1)}</td>
                  <td className="px-3 py-3 text-right">{r.openChangeOrderValue > 0 ? formatMoney(r.openChangeOrderValue) : "—"}</td>
                  <td className="px-3 py-3">
                    {r.billingReady ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 whitespace-nowrap">Ready</span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${RISK_CLASSES[r.riskLevel]}`}>
                      {RISK_LABEL[r.riskLevel]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
