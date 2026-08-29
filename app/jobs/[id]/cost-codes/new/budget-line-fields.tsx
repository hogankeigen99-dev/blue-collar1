"use client";

import { useState } from "react";
import type { CostCodeRates } from "@/lib/productivity-benchmarks";

type CostCodeOption = { id: string; code: string; description: string; unit: string };

/** Items 1/2/4: historical productivity surfaced right where a budget line
 * is estimated — company rate vs. recent-job rate vs. a recommended rate,
 * live for whichever cost code is selected, with one click to apply it. */
export default function BudgetLineFields({
  costCodes,
  rates,
}: {
  costCodes: CostCodeOption[];
  rates: Record<string, CostCodeRates>;
}) {
  const [costCodeId, setCostCodeId] = useState(costCodes[0]?.id ?? "");
  const [estimatedQty, setEstimatedQty] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");

  const selected = costCodes.find((c) => c.id === costCodeId);
  const r = rates[costCodeId];
  const hasHistory = r && (r.companyRate !== null || r.recentRate !== null);

  function useRecommendedRate() {
    const qty = Number(estimatedQty);
    if (!r?.recommendedRate || !Number.isFinite(qty) || qty <= 0) return;
    setEstimatedHours((r.recommendedRate * qty).toFixed(1));
  }

  return (
    <>
      <div>
        <label className="block text-sm font-medium mb-1">Cost code *</label>
        <select
          name="costCodeId"
          required
          value={costCodeId}
          onChange={(e) => setCostCodeId(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm"
        >
          {costCodes.map((cc) => (
            <option key={cc.id} value={cc.id}>
              {cc.code} — {cc.description} ({cc.unit})
            </option>
          ))}
        </select>
      </div>

      {hasHistory ? (
        <div className="bg-slate-50 border rounded-md p-3 text-xs space-y-2">
          <div className="font-medium text-slate-700">Historical productivity for this code</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-slate-500">Company rate (all-time)</div>
              <div className="font-medium">
                {r!.companyRate !== null ? `${r!.companyRate.toFixed(2)} hrs/${selected?.unit}` : "—"}
                {r!.companySampleSize > 0 && (
                  <span className="text-slate-400 font-normal">
                    {" "}
                    ({r!.companySampleSize} job{r!.companySampleSize === 1 ? "" : "s"})
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Recent-job rate</div>
              <div className="font-medium">
                {r!.recentRate !== null ? `${r!.recentRate.toFixed(2)} hrs/${selected?.unit}` : "—"}
                {r!.recentSampleSize > 0 && (
                  <span className="text-slate-400 font-normal">
                    {" "}
                    (last {r!.recentSampleSize})
                  </span>
                )}
              </div>
            </div>
          </div>
          {r!.recommendedRate !== null && (
            <div className="flex items-center justify-between gap-3 pt-2 border-t">
              <div>
                <span className="text-slate-500">Recommended: </span>
                <span className="font-medium">
                  {r!.recommendedRate.toFixed(2)} hrs/{selected?.unit}
                </span>
                <span className="text-slate-400">
                  {" "}
                  (from {r!.recommendedSource === "recent" ? "recent jobs" : "all-time company history"})
                </span>
              </div>
              <button
                type="button"
                onClick={useRecommendedRate}
                disabled={!estimatedQty}
                className="flex-shrink-0 text-blue-600 hover:underline disabled:text-slate-300 disabled:no-underline"
              >
                Use recommended &rarr;
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          No completed-job history for this code yet — nothing to compare against.
        </p>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Estimated quantity *</label>
        <input
          name="estimatedQty"
          type="number"
          step="any"
          min="0"
          required
          value={estimatedQty}
          onChange={(e) => setEstimatedQty(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Estimated hours *</label>
        <input
          name="estimatedHours"
          type="number"
          step="any"
          min="0"
          required
          value={estimatedHours}
          onChange={(e) => setEstimatedHours(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>
    </>
  );
}
