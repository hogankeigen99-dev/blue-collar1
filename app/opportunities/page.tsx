import Link from "next/link";
import { scopedPrisma } from "@/lib/tenant";
import { getOpportunityPipeline, getWinRateReport } from "@/lib/opportunities";
import { requireSession } from "@/lib/session";
import { formatMoney, formatDate, OPPORTUNITY_STAGE_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

function pct(n: number | null): string {
  return n !== null ? `${(n * 100).toFixed(0)}%` : "—";
}

const STAGE_CLASSES: Record<string, string> = {
  OPPORTUNITY: "bg-slate-100 text-slate-600",
  BIDDING: "bg-blue-100 text-blue-700",
  SUBMITTED: "bg-amber-100 text-amber-700",
};

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ assignedToUserId?: string; projectType?: string; includeDecided?: string }>;
}) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const sp = await searchParams;

  const [pipeline, winRate, pmUsers, projectTypeRows] = await Promise.all([
    getOpportunityPipeline(session.companyId, {
      assignedToUserId: sp.assignedToUserId || undefined,
      projectType: sp.projectType || undefined,
      openOnly: sp.includeDecided !== "1",
    }),
    getWinRateReport(session.companyId),
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "PM"] }, active: true }, orderBy: { name: "asc" } }),
    prisma.opportunity.findMany({ where: { projectType: { not: null } }, select: { projectType: true }, distinct: ["projectType"] }),
  ]);
  const projectTypes = projectTypeRows.map((r) => r.projectType!).sort();
  const hasActiveFilters = Object.values(sp).some((v) => v);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pipeline</h1>
          <p className="text-slate-500 text-sm mt-1">
            What&apos;s out to bid, before it&apos;s a real project — win it here and it becomes a Job through the
            same Award flow every other project goes through, cost codes carried over automatically.
          </p>
        </div>
        <Link href="/opportunities/new" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
          + New opportunity
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">Open pipeline</div>
          <div className="text-xl font-semibold mt-1">{winRate.openCount}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">Pipeline value</div>
          <div className="text-xl font-semibold mt-1">{formatMoney(winRate.openValue)}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">Win rate (won ÷ won+lost)</div>
          <div className="text-xl font-semibold mt-1">{pct(winRate.overallWinRatePct)}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">Won / Lost</div>
          <div className="text-xl font-semibold mt-1">{winRate.wonCount} / {winRate.lostCount}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">No-bid</div>
          <div className="text-xl font-semibold mt-1">{winRate.noBidCount}</div>
        </div>
      </div>

      {(winRate.byProjectType.length > 0 || winRate.byAssignee.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">
          {winRate.byProjectType.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-700">Win rate by project type</h2>
              <div className="bg-white border rounded-lg divide-y">
                {winRate.byProjectType.map((s) => (
                  <div key={s.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span>{s.label}</span>
                    <span className="text-slate-500">
                      {s.won}W / {s.lost}L{s.noBid > 0 ? ` / ${s.noBid} no-bid` : ""} —{" "}
                      <span className="font-medium text-slate-900">{pct(s.winRatePct)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {winRate.byAssignee.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-700">Win rate by estimator/PM</h2>
              <div className="bg-white border rounded-lg divide-y">
                {winRate.byAssignee.map((s) => (
                  <div key={s.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span>{s.label}</span>
                    <span className="text-slate-500">
                      {s.won}W / {s.lost}L{s.noBid > 0 ? ` / ${s.noBid} no-bid` : ""} —{" "}
                      <span className="font-medium text-slate-900">{pct(s.winRatePct)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <form method="GET" className="bg-white border rounded-lg p-4 flex flex-wrap items-end gap-3 text-sm">
          <div>
            <label className="block text-xs font-medium mb-1">Assigned to</label>
            <select name="assignedToUserId" defaultValue={sp.assignedToUserId ?? ""} className="border rounded-md px-2 py-1.5">
              <option value="">— Any —</option>
              {pmUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
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
          <label className="flex items-center gap-1.5 text-xs pb-1.5">
            <input type="checkbox" name="includeDecided" value="1" defaultChecked={sp.includeDecided === "1"} />
            Include won/lost/no-bid
          </label>
          <button type="submit" className="bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-700">
            Apply
          </button>
          {hasActiveFilters && (
            <Link href="/opportunities" className="text-blue-600 hover:underline">
              Clear
            </Link>
          )}
        </form>

        {pipeline.length === 0 ? (
          <p className="text-slate-500 text-sm bg-white border rounded-lg p-6">
            Nothing in the pipeline right now.{" "}
            <Link href="/opportunities/new" className="text-blue-600 hover:underline">
              Add an opportunity
            </Link>
            .
          </p>
        ) : (
          <div className="bg-white border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="px-4 py-3 font-medium">Opportunity</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Assigned</th>
                  <th className="px-4 py-3 font-medium text-right">Est. value</th>
                  <th className="px-4 py-3 font-medium text-right">Probability</th>
                  <th className="px-4 py-3 font-medium">Bid due</th>
                  <th className="px-4 py-3 font-medium">Stage</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pipeline.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/opportunities/${o.id}`} className="font-medium hover:underline">
                        {o.title}
                      </Link>
                      <div className="text-xs text-slate-400">
                        {o.bidNumber}
                        {o.projectType ? ` · ${o.projectType}` : ""}
                        {o.costCodeLineCount > 0 ? ` · ${o.costCodeLineCount} cost code line(s)` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{o.customerName ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{o.assignedToName ?? "—"}</td>
                    <td className="px-4 py-3 text-right">{o.estimatedValue !== null ? formatMoney(o.estimatedValue) : "—"}</td>
                    <td className="px-4 py-3 text-right">{o.probability !== null ? `${o.probability}%` : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(o.bidDueDate)}</td>
                    <td className="px-4 py-3">
                      {o.stage === "WON" ? (
                        <Link href={o.wonJobId ? `/jobs/${o.wonJobId}` : "#"} className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 hover:underline">
                          Won →
                        </Link>
                      ) : o.stage === "LOST" || o.stage === "NO_BID" ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">{OPPORTUNITY_STAGE_LABEL[o.stage]}</span>
                      ) : (
                        <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${STAGE_CLASSES[o.stage] ?? "bg-slate-100 text-slate-600"}`}>
                          {OPPORTUNITY_STAGE_LABEL[o.stage]}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
