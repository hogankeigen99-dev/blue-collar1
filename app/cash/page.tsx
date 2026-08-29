import Link from "next/link";
import { getArAging, getApAging, getRetainageSummary, getCashForecast, type AgingReport, type AgingBucket } from "@/lib/cash";
import { requireSession } from "@/lib/session";
import { canManageEstimates } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const BUCKET_LABEL: Record<AgingBucket, string> = {
  "0-30": "0–30 days",
  "31-60": "31–60 days",
  "61-90": "61–90 days",
  "90+": "90+ days",
};
const BUCKET_ORDER: AgingBucket[] = ["0-30", "31-60", "61-90", "90+"];

function AgingTable({ title, report, referenceLabel }: { title: string; report: AgingReport; referenceLabel: string }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium">
        {title} <span className="text-slate-400 font-normal text-base">({formatMoney(report.total)})</span>
      </h2>

      <div className="grid grid-cols-4 gap-3">
        {BUCKET_ORDER.map((b) => (
          <div key={b} className={`bg-white border rounded-lg p-3 ${b === "90+" && report.bucketTotals[b] > 0 ? "border-red-300" : ""}`}>
            <div className="text-xs text-slate-500">{BUCKET_LABEL[b]}</div>
            <div className={`text-lg font-semibold mt-1 ${b === "90+" && report.bucketTotals[b] > 0 ? "text-red-600" : ""}`}>
              {formatMoney(report.bucketTotals[b])}
            </div>
          </div>
        ))}
      </div>

      {report.rows.length === 0 ? (
        <p className="text-slate-500 text-sm bg-white border rounded-lg p-4">Nothing outstanding.</p>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">{referenceLabel}</th>
                <th className="px-4 py-3 font-medium">Since</th>
                <th className="px-4 py-3 font-medium text-right">Days</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.rows.map((r, i) => (
                <tr key={i} className={r.bucket === "90+" ? "bg-red-50" : ""}>
                  <td className="px-4 py-3">
                    <Link href={`/jobs/${r.jobId}`} className="font-medium hover:underline">{r.jobTitle}</Link>
                    <div className="text-xs text-slate-400">{r.jobNumber}</div>
                  </td>
                  <td className="px-4 py-3">{r.reference}</td>
                  <td className="px-4 py-3">{formatDate(r.anchorDate)}</td>
                  <td className={`px-4 py-3 text-right ${r.bucket === "90+" ? "text-red-600 font-medium" : ""}`}>{r.daysOutstanding}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatMoney(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default async function CashPage() {
  const session = await requireSession();
  if (!canManageEstimates(session.role)) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl font-semibold">Cash</h1>
        <p className="text-slate-500 text-sm mt-2">Only PM/ADMIN roles can view company-wide cash.</p>
      </div>
    );
  }

  const [ar, ap, retainage, forecast] = await Promise.all([
    getArAging(session.companyId),
    getApAging(session.companyId),
    getRetainageSummary(session.companyId),
    getCashForecast(session.companyId, 8),
  ]);

  const net = ar.total - ap.total;
  const maxForecastMagnitude = Math.max(
    1,
    ...forecast.weeks.map((w) => Math.max(w.expectedIn, w.expectedOut)),
    forecast.overdueIn,
    forecast.overdueOut
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Cash</h1>
        <p className="text-slate-500 text-sm mt-1">
          What&apos;s been billed but not collected, what&apos;s been billed to us but not paid, and a forecast of
          when — a computed rollup over invoices, subcontracts, and materials, not a separate ledger.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">Total AR (outstanding)</div>
          <div className="text-xl font-semibold mt-1">{formatMoney(ar.total)}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">Total AP (outstanding)</div>
          <div className="text-xl font-semibold mt-1">{formatMoney(ap.total)}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">Net position</div>
          <div className={`text-xl font-semibold mt-1 ${net < 0 ? "text-red-600" : ""}`}>{formatMoney(net)}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">Retainage held (owner / by us)</div>
          <div className="text-xl font-semibold mt-1">
            {formatMoney(retainage.heldByOwner)} <span className="text-slate-400 text-sm font-normal">/</span> {formatMoney(retainage.heldFromSubs)}
          </div>
        </div>
      </div>

      <AgingTable title="Accounts receivable" report={ar} referenceLabel="Invoice" />
      <AgingTable title="Accounts payable" report={ap} referenceLabel="Vendor / bill" />

      <div className="space-y-3">
        <h2 className="text-lg font-medium">8-week cash forecast</h2>
        <p className="text-xs text-slate-500">
          A simplification, not a schedule-driven forecast: each outstanding row is assumed to collect or pay on a
          Net-30 basis from its own aging date. Anything already past that 30-day mark shows as overdue rather than
          projected into a future week.
        </p>

        {(forecast.overdueIn > 0 || forecast.overdueOut > 0) && (
          <div className="flex gap-6 text-sm bg-red-50 border border-red-200 rounded-lg p-4">
            <span>Overdue in (past Net-30): <span className="font-medium text-red-700">{formatMoney(forecast.overdueIn)}</span></span>
            <span>Overdue out (past Net-30): <span className="font-medium text-red-700">{formatMoney(forecast.overdueOut)}</span></span>
          </div>
        )}

        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-4 py-3 font-medium">Week of</th>
                <th className="px-4 py-3 font-medium">Expected in</th>
                <th className="px-4 py-3 font-medium">Expected out</th>
                <th className="px-4 py-3 font-medium text-right">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {forecast.weeks.map((w) => (
                <tr key={w.label}>
                  <td className="px-4 py-3 font-medium">{w.label}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 bg-green-500 rounded" style={{ width: `${(w.expectedIn / maxForecastMagnitude) * 100}%`, minWidth: w.expectedIn > 0 ? "2px" : 0 }} />
                      <span className="text-xs text-slate-500 whitespace-nowrap">{formatMoney(w.expectedIn)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 bg-red-400 rounded" style={{ width: `${(w.expectedOut / maxForecastMagnitude) * 100}%`, minWidth: w.expectedOut > 0 ? "2px" : 0 }} />
                      <span className="text-xs text-slate-500 whitespace-nowrap">{formatMoney(w.expectedOut)}</span>
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${w.net < 0 ? "text-red-600" : "text-green-700"}`}>{formatMoney(w.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
