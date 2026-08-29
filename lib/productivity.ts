export type ProductivityStatus = "not_started" | "on_pace" | "watch" | "over_budget";

export type JobCostCodeProgress = {
  actualHours: number;
  actualQty: number;
  estimatedRate: number | null;
  actualRate: number | null;
  hoursVariancePct: number | null;
  status: ProductivityStatus;
  /** Item 6 — the PM forecast: hours this cost code will land at if it
   * finishes the remaining quantity at today's actual rate. Once work has
   * started, this is actualRate × estimatedQty (the honest projection);
   * before that, it's just the estimate, since there's no burn rate yet. */
  projectedHours: number;
};

/** Variance thresholds on actual-vs-estimated hrs/unit before a code is flagged. */
const WATCH_THRESHOLD = 0.05; // 5% over
const OVER_BUDGET_THRESHOLD = 0.15; // 15% over

export function computeProgress(
  estimatedQty: number,
  estimatedHours: number,
  entries: { hours: number; quantity: number }[]
): JobCostCodeProgress {
  const actualHours = entries.reduce((sum, e) => sum + e.hours, 0);
  const actualQty = entries.reduce((sum, e) => sum + e.quantity, 0);
  const estimatedRate = estimatedQty > 0 ? estimatedHours / estimatedQty : null;
  const actualRate = actualQty > 0 ? actualHours / actualQty : null;

  let hoursVariancePct: number | null = null;
  let status: ProductivityStatus = "not_started";

  if (actualQty === 0) {
    status = "not_started";
  } else if (estimatedRate && actualRate !== null) {
    hoursVariancePct = (actualRate - estimatedRate) / estimatedRate;
    if (hoursVariancePct <= WATCH_THRESHOLD) status = "on_pace";
    else if (hoursVariancePct <= OVER_BUDGET_THRESHOLD) status = "watch";
    else status = "over_budget";
  }

  const projectedHours = actualQty > 0 && actualRate !== null ? actualRate * estimatedQty : estimatedHours;

  return { actualHours, actualQty, estimatedRate, actualRate, hoursVariancePct, status, projectedHours };
}

export const PRODUCTIVITY_STATUS_LABEL: Record<ProductivityStatus, string> = {
  not_started: "Not started",
  on_pace: "On pace",
  watch: "Watch",
  over_budget: "Over budget",
};

export const PRODUCTIVITY_STATUS_CLASSES: Record<ProductivityStatus, string> = {
  not_started: "bg-slate-100 text-slate-600",
  on_pace: "bg-green-100 text-green-700",
  watch: "bg-amber-100 text-amber-700",
  over_budget: "bg-red-100 text-red-700",
};
