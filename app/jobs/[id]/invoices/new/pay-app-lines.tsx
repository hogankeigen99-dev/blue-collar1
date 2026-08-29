"use client";

import { useState } from "react";

export type PayAppLine = {
  id: string;
  description: string;
  scheduledValue: number;
  priorPct: number;
};

function fmt(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** One row per Schedule of Values line — a PM types this period's
 * cumulative % complete and sees the earned amount and retainage withheld
 * computed live, the same math lib/invoice-actions.ts's createPayApplication
 * applies server-side on submit. Rows post as position-zipped
 * contractLineId/pctCompleteToDate fields (mirrors app/jobs/new/award-form.tsx's
 * zipRows pattern) so no indexed field names are needed. */
export default function PayAppLines({ lines, retainagePct }: { lines: PayAppLine[]; retainagePct: number }) {
  const [pct, setPct] = useState<Record<string, string>>({});

  const rows = lines.map((line) => {
    const raw = pct[line.id];
    const parsed = raw !== undefined && raw.trim() !== "" ? Number(raw) : line.priorPct;
    const newPct = Number.isFinite(parsed) ? Math.min(100, Math.max(line.priorPct, parsed)) : line.priorPct;
    const amountThisPeriod = Math.max(0, ((newPct - line.priorPct) / 100) * line.scheduledValue);
    const retainageWithheld = amountThisPeriod * (retainagePct / 100);
    return { line, raw, amountThisPeriod, retainageWithheld };
  });
  const totalThisPeriod = rows.reduce((s, r) => s + r.amountThisPeriod, 0);
  const totalRetainage = rows.reduce((s, r) => s + r.retainageWithheld, 0);

  return (
    <div className="bg-white border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="px-4 py-3 font-medium">SOV line</th>
            <th className="px-4 py-3 font-medium text-right">Scheduled value</th>
            <th className="px-4 py-3 font-medium text-right">Billed to date</th>
            <th className="px-4 py-3 font-medium text-right w-32">% complete to date</th>
            <th className="px-4 py-3 font-medium text-right">This period</th>
            <th className="px-4 py-3 font-medium text-right">Retainage withheld</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(({ line, raw, amountThisPeriod, retainageWithheld }) => (
            <tr key={line.id}>
              <td className="px-4 py-3">{line.description}</td>
              <td className="px-4 py-3 text-right">{fmt(line.scheduledValue)}</td>
              <td className="px-4 py-3 text-right text-slate-500">{line.priorPct.toFixed(0)}%</td>
              <td className="px-4 py-3 text-right">
                <input type="hidden" name="contractLineId" value={line.id} />
                <input
                  name="pctCompleteToDate"
                  type="number"
                  step="any"
                  min={line.priorPct}
                  max={100}
                  placeholder={`${line.priorPct.toFixed(0)}`}
                  value={raw ?? ""}
                  onChange={(e) => setPct((p) => ({ ...p, [line.id]: e.target.value }))}
                  className="w-24 border rounded-md px-2 py-1.5 text-sm text-right"
                />
              </td>
              <td className="px-4 py-3 text-right">{amountThisPeriod > 0 ? fmt(amountThisPeriod) : "—"}</td>
              <td className="px-4 py-3 text-right text-slate-500">{retainageWithheld > 0 ? fmt(retainageWithheld) : "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-medium bg-slate-50 border-t">
            <td className="px-4 py-3" colSpan={4}>
              Total this period {retainagePct > 0 && <span className="text-slate-500 font-normal">({retainagePct}% retainage)</span>}
            </td>
            <td className="px-4 py-3 text-right">{fmt(totalThisPeriod)}</td>
            <td className="px-4 py-3 text-right">{fmt(totalRetainage)}</td>
          </tr>
          <tr className="font-semibold">
            <td className="px-4 py-3" colSpan={5}>
              Net amount due this period
            </td>
            <td className="px-4 py-3 text-right">{fmt(totalThisPeriod - totalRetainage)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
