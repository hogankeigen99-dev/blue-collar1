import Link from "next/link";
import { scopedPrisma } from "@/lib/tenant";
import {
  getFilteredHistoricalProductivity,
  getEstimatingAccuracy,
  ACCURACY_VERDICT_LABEL,
  type AccuracyVerdict,
} from "@/lib/productivity-benchmarks";
import { requireSession } from "@/lib/session";
import { canManageEstimates } from "@/lib/auth";

export const dynamic = "force-dynamic";

const VERDICT_CLASSES: Record<AccuracyVerdict, string> = {
  consistently_underestimated: "bg-red-100 text-red-700",
  consistently_overestimated: "bg-amber-100 text-amber-700",
  accurate: "bg-green-100 text-green-700",
  inconsistent: "bg-slate-100 text-slate-600",
  insufficient_data: "bg-slate-100 text-slate-400",
};

function pct(n: number | null, digits = 0): string {
  return n !== null ? `${n >= 0 ? "+" : ""}${(n * 100).toFixed(digits)}%` : "—";
}

export default async function CostCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ projectType?: string; foremanWorkerId?: string; qtyMin?: string; qtyMax?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const sp = await searchParams;

  const filters = {
    projectType: sp.projectType || undefined,
    foremanWorkerId: sp.foremanWorkerId || undefined,
    qtyMin: sp.qtyMin ? Number(sp.qtyMin) : undefined,
    qtyMax: sp.qtyMax ? Number(sp.qtyMax) : undefined,
    dateFrom: sp.dateFrom ? new Date(sp.dateFrom) : undefined,
    dateTo: sp.dateTo ? new Date(sp.dateTo) : undefined,
  };
  const hasActiveFilters = Object.values(sp).some((v) => v);

  const [costCodes, accuracy, projectTypeRows, foremen] = await Promise.all([
    getFilteredHistoricalProductivity(session.companyId, filters),
    getEstimatingAccuracy(session.companyId),
    prisma.costCodeBenchmark.findMany({ where: { projectType: { not: null } }, select: { projectType: true }, distinct: ["projectType"] }),
    prisma.worker.findMany({ where: { benchmarksAsForeman: { some: {} } }, orderBy: { name: "asc" } }),
  ]);
  const projectTypes = projectTypeRows.map((r) => r.projectType!).sort();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cost codes</h1>
          <p className="text-slate-500 text-sm mt-1">
            Historical actual productivity from completed jobs — the estimating asset.
          </p>
        </div>
        {session && canManageEstimates(session.role) && (
          <Link
            href="/cost-codes/new"
            className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
          >
            + New cost code
          </Link>
        )}
      </div>

      {/* Item 7: estimating accuracy dashboard */}
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-medium">Estimating accuracy</h2>
          <p className="text-slate-500 text-sm mt-1">
            Cost codes where the bid assumption and the field reality consistently disagree, worst first.
          </p>
        </div>
        {accuracy.length === 0 ? (
          <p className="text-slate-500 text-sm">No completed jobs with logged production yet.</p>
        ) : (
          <div className="bg-white border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="px-4 py-3 font-medium">Cost code</th>
                  <th className="px-4 py-3 font-medium text-right"># jobs</th>
                  <th className="px-4 py-3 font-medium text-right">Avg est. rate</th>
                  <th className="px-4 py-3 font-medium text-right">Avg actual rate</th>
                  <th className="px-4 py-3 font-medium text-right">Avg variance</th>
                  <th className="px-4 py-3 font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {accuracy.map((row) => (
                  <tr key={row.costCodeId}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{row.code}</div>
                      <div className="text-slate-500 text-xs">
                        {row.description} ({row.unit})
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">{row.jobCount}</td>
                    <td className="px-4 py-3 text-right">{row.avgEstimatedRate?.toFixed(2) ?? "—"}</td>
                    <td className="px-4 py-3 text-right">{row.avgActualRate?.toFixed(2) ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium">{pct(row.avgVariancePct, 1)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${VERDICT_CLASSES[row.verdict]}`}>
                        {ACCURACY_VERDICT_LABEL[row.verdict]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Item 3: filterable historical productivity */}
      <div className="space-y-3">
        <h2 className="text-lg font-medium">Historical productivity</h2>

        <form method="GET" className="bg-white border rounded-lg p-4 flex flex-wrap items-end gap-3 text-sm">
          <div>
            <label className="block text-xs font-medium mb-1">Project type</label>
            <select name="projectType" defaultValue={sp.projectType ?? ""} className="border rounded-md px-2 py-1.5">
              <option value="">— Any —</option>
              {projectTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Crew (foreman)</label>
            <select name="foremanWorkerId" defaultValue={sp.foremanWorkerId ?? ""} className="border rounded-md px-2 py-1.5">
              <option value="">— Any —</option>
              {foremen.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Qty min</label>
            <input name="qtyMin" type="number" step="any" defaultValue={sp.qtyMin ?? ""} className="w-24 border rounded-md px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Qty max</label>
            <input name="qtyMax" type="number" step="any" defaultValue={sp.qtyMax ?? ""} className="w-24 border rounded-md px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Completed from</label>
            <input name="dateFrom" type="date" defaultValue={sp.dateFrom ?? ""} className="border rounded-md px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Completed to</label>
            <input name="dateTo" type="date" defaultValue={sp.dateTo ?? ""} className="border rounded-md px-2 py-1.5" />
          </div>
          <button type="submit" className="bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-700">
            Apply filters
          </button>
          {hasActiveFilters && (
            <Link href="/cost-codes" className="text-blue-600 hover:underline">
              Clear
            </Link>
          )}
        </form>

        {costCodes.length === 0 ? (
          <p className="text-slate-500 text-sm">No cost codes yet.</p>
        ) : (
          <div className="bg-white border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Unit</th>
                  <th className="px-4 py-3 font-medium text-right">Total hours</th>
                  <th className="px-4 py-3 font-medium text-right">Total qty</th>
                  <th className="px-4 py-3 font-medium text-right">Avg hrs/unit</th>
                  <th className="px-4 py-3 font-medium text-right"># jobs</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {costCodes.map((cc) => (
                  <tr key={cc.costCodeId}>
                    <td className="px-4 py-3 font-medium">{cc.code}</td>
                    <td className="px-4 py-3 text-slate-600">{cc.description}</td>
                    <td className="px-4 py-3 text-slate-600">{cc.unit}</td>
                    <td className="px-4 py-3 text-right">{cc.totalHours.toFixed(1)}</td>
                    <td className="px-4 py-3 text-right">{cc.totalQty.toFixed(1)}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {cc.avgRate !== null ? cc.avgRate.toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">{cc.jobCount || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-500">
          Only counts cost-code lines from jobs that have reached Complete — in-progress work doesn&apos;t skew the benchmark.
        </p>
      </div>
    </div>
  );
}
