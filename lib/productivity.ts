import { scopedPrisma } from "@/lib/tenant";

export type ProductivityStatus = "not_started" | "on_pace" | "watch" | "over_budget";

export type JobCostCodeProgress = {
  actualHours: number;
  actualQty: number;
  estimatedRate: number | null;
  actualRate: number | null;
  hoursVariancePct: number | null;
  status: ProductivityStatus;
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

  return { actualHours, actualQty, estimatedRate, actualRate, hoursVariancePct, status };
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

export type HistoricalProductivity = {
  costCodeId: string;
  code: string;
  description: string;
  unit: string;
  totalHours: number;
  totalQty: number;
  avgRate: number | null;
  jobCount: number;
};

/** Aggregates actual hrs/unit for every cost code across every job that has logged production against it — the historical estimating asset. */
export async function getHistoricalProductivity(companyId: string): Promise<HistoricalProductivity[]> {
  const prisma = scopedPrisma(companyId);
  const costCodes = await prisma.costCode.findMany({
    orderBy: { code: "asc" },
    include: {
      jobCostCodes: {
        include: { entries: true },
      },
    },
  });

  return costCodes.map((cc) => {
    const jobsWithEntries = cc.jobCostCodes.filter((jcc) => jcc.entries.length > 0);
    const totalHours = jobsWithEntries.reduce(
      (sum, jcc) => sum + jcc.entries.reduce((s, e) => s + e.hours, 0),
      0
    );
    const totalQty = jobsWithEntries.reduce(
      (sum, jcc) => sum + jcc.entries.reduce((s, e) => s + e.quantity, 0),
      0
    );
    return {
      costCodeId: cc.id,
      code: cc.code,
      description: cc.description,
      unit: cc.unit,
      totalHours,
      totalQty,
      avgRate: totalQty > 0 ? totalHours / totalQty : null,
      jobCount: jobsWithEntries.length,
    };
  });
}
