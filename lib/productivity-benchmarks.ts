import { scopedPrisma } from "@/lib/tenant";
import { computeProgress } from "@/lib/productivity";
import type { Prisma } from "@prisma/client";

/** How many of a cost code's most-recently-completed jobs count as "recent" for a trend rate. */
const RECENT_JOB_COUNT = 3;
/** Below this many completed jobs, a bias verdict is just noise. */
const MIN_JOBS_FOR_VERDICT = 2;
/** Average variance below this magnitude reads as "accurate," not a bias worth flagging. */
const BIAS_THRESHOLD = 0.1;
/** Fraction of jobs that must agree on the variance's direction before it counts as "consistent" rather than just noisy. */
const CONSISTENCY_THRESHOLD = 0.7;

/**
 * Snapshots this job's finished cost-code lines into CostCodeBenchmark — the
 * "at-completion variance added to historical benchmarks" step. Called
 * whenever a job's stage becomes COMPLETE (lib/command-center-actions.ts).
 * A cost-code line with no actual entries yet (estimated but never worked)
 * isn't a real data point and is skipped. Upserts on (jobId, costCodeId), so
 * re-saving a completed job doesn't duplicate history.
 */
export async function recordBenchmarksForCompletedJob(prisma: ReturnType<typeof scopedPrisma>, jobId: string) {
  const job = await prisma.job.findFirstOrThrow({
    where: { id: jobId },
    select: { projectType: true, foremanWorkerId: true },
  });
  const jobCostCodes = await prisma.jobCostCode.findMany({
    where: { jobId },
    include: { entries: true },
  });

  for (const jcc of jobCostCodes) {
    const progress = computeProgress(jcc.estimatedQty, jcc.estimatedHours, jcc.entries);
    if (progress.actualQty <= 0) continue;

    const data = {
      projectType: job.projectType,
      foremanWorkerId: job.foremanWorkerId,
      estimatedQty: jcc.estimatedQty,
      estimatedHours: jcc.estimatedHours,
      actualQty: progress.actualQty,
      actualHours: progress.actualHours,
      estimatedRate: progress.estimatedRate,
      actualRate: progress.actualRate,
      variancePct: progress.hoursVariancePct,
    };

    await prisma.costCodeBenchmark.upsert({
      where: { jobId_costCodeId: { jobId, costCodeId: jcc.costCodeId } },
      update: { ...data, recordedAt: new Date() },
      create: { jobId, costCodeId: jcc.costCodeId, ...data },
    });
  }
}

function weightedRate(rows: { actualHours: number; actualQty: number }[]): number | null {
  const totalHours = rows.reduce((s, r) => s + r.actualHours, 0);
  const totalQty = rows.reduce((s, r) => s + r.actualQty, 0);
  return totalQty > 0 ? totalHours / totalQty : null;
}

export type CostCodeRates = {
  companyRate: number | null;
  companySampleSize: number;
  recentRate: number | null;
  recentSampleSize: number;
  recommendedRate: number | null;
  recommendedSource: "recent" | "company" | null;
};

/**
 * Company-wide, recent-jobs, and recommended hrs/unit rate for one cost
 * code — items 2 and 4: "estimated vs. company historical vs. recent-job
 * rate" and the recommended rate itself. Prefers the trend from the most
 * recent jobs once there are enough of them to mean something; falls back
 * to the full company history otherwise.
 */
function ratesFromBenchmarks(benchmarksDescByDate: { actualHours: number; actualQty: number }[]): CostCodeRates {
  const companyRate = weightedRate(benchmarksDescByDate);
  const recent = benchmarksDescByDate.slice(0, RECENT_JOB_COUNT);
  const recentRate = weightedRate(recent);

  let recommendedRate: number | null = null;
  let recommendedSource: "recent" | "company" | null = null;
  if (recent.length >= 2 && recentRate !== null) {
    recommendedRate = recentRate;
    recommendedSource = "recent";
  } else if (companyRate !== null) {
    recommendedRate = companyRate;
    recommendedSource = "company";
  }

  return {
    companyRate,
    companySampleSize: benchmarksDescByDate.length,
    recentRate,
    recentSampleSize: recent.length,
    recommendedRate,
    recommendedSource,
  };
}

export async function getCostCodeRates(companyId: string, costCodeId: string): Promise<CostCodeRates> {
  const prisma = scopedPrisma(companyId);
  // CostCodeBenchmark isn't itself company-scoped — verify the cost code belongs to this company first.
  await prisma.costCode.findFirstOrThrow({ where: { id: costCodeId } });
  const benchmarks = await prisma.costCodeBenchmark.findMany({
    where: { costCodeId },
    orderBy: { recordedAt: "desc" },
  });
  return ratesFromBenchmarks(benchmarks);
}

/** All cost codes' rates in one query — for the Add Budget Line form's inline panel, which needs to
 * look up a rate the instant the foreman/PM picks a cost code without a network round trip per pick. */
export async function getAllCostCodeRatesMap(companyId: string): Promise<Record<string, CostCodeRates>> {
  const prisma = scopedPrisma(companyId);
  const costCodes = await prisma.costCode.findMany({
    select: { id: true, benchmarks: { orderBy: { recordedAt: "desc" } } },
  });
  return Object.fromEntries(costCodes.map((cc) => [cc.id, ratesFromBenchmarks(cc.benchmarks)]));
}

export type HistoricalFilters = {
  projectType?: string;
  foremanWorkerId?: string;
  qtyMin?: number;
  qtyMax?: number;
  dateFrom?: Date;
  dateTo?: Date;
};

export type FilteredHistoricalRow = {
  costCodeId: string;
  code: string;
  description: string;
  unit: string;
  totalHours: number;
  totalQty: number;
  avgRate: number | null;
  jobCount: number;
};

/** Item 1/3: historical productivity per cost code, filterable by project
 * type, crew (foreman), a job-size quantity range, and a date range — the
 * same figures shown unfiltered are what feed the recommended rate above. */
export async function getFilteredHistoricalProductivity(
  companyId: string,
  filters: HistoricalFilters = {}
): Promise<FilteredHistoricalRow[]> {
  const prisma = scopedPrisma(companyId);

  const where: Prisma.CostCodeBenchmarkWhereInput = {};
  if (filters.projectType) where.projectType = filters.projectType;
  if (filters.foremanWorkerId) where.foremanWorkerId = filters.foremanWorkerId;
  if (filters.qtyMin !== undefined || filters.qtyMax !== undefined) {
    where.estimatedQty = {
      ...(filters.qtyMin !== undefined ? { gte: filters.qtyMin } : {}),
      ...(filters.qtyMax !== undefined ? { lte: filters.qtyMax } : {}),
    };
  }
  if (filters.dateFrom || filters.dateTo) {
    where.recordedAt = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }

  const costCodes = await prisma.costCode.findMany({
    orderBy: { code: "asc" },
    include: { benchmarks: { where } },
  });

  return costCodes.map((cc) => {
    const totalHours = cc.benchmarks.reduce((s, b) => s + b.actualHours, 0);
    const totalQty = cc.benchmarks.reduce((s, b) => s + b.actualQty, 0);
    return {
      costCodeId: cc.id,
      code: cc.code,
      description: cc.description,
      unit: cc.unit,
      totalHours,
      totalQty,
      avgRate: totalQty > 0 ? totalHours / totalQty : null,
      jobCount: cc.benchmarks.length,
    };
  });
}

function average(nums: number[]): number | null {
  return nums.length > 0 ? nums.reduce((s, n) => s + n, 0) / nums.length : null;
}

export type AccuracyVerdict =
  | "consistently_underestimated"
  | "consistently_overestimated"
  | "accurate"
  | "inconsistent"
  | "insufficient_data";

export const ACCURACY_VERDICT_LABEL: Record<AccuracyVerdict, string> = {
  consistently_underestimated: "Consistently underestimated",
  consistently_overestimated: "Consistently overestimated",
  accurate: "Accurate",
  inconsistent: "Inconsistent (no clear direction)",
  insufficient_data: "Not enough history yet",
};

export type EstimatingAccuracyRow = {
  costCodeId: string;
  code: string;
  description: string;
  unit: string;
  jobCount: number;
  avgEstimatedRate: number | null;
  avgActualRate: number | null;
  avgVariancePct: number | null;
  consistency: number | null;
  verdict: AccuracyVerdict;
};

/**
 * Item 7: the cost codes where estimating assumptions are consistently
 * wrong, worst first. "Consistent" means most completed jobs on that code
 * missed in the same direction, not just one bad job dragging an average —
 * a code with wildly mixed variance is flagged "inconsistent," not blamed
 * on a single bias to fix.
 */
export async function getEstimatingAccuracy(companyId: string): Promise<EstimatingAccuracyRow[]> {
  const prisma = scopedPrisma(companyId);
  const costCodes = await prisma.costCode.findMany({
    orderBy: { code: "asc" },
    include: { benchmarks: true },
  });

  const rows: EstimatingAccuracyRow[] = costCodes
    .map((cc) => {
      const withVariance = cc.benchmarks.filter(
        (b): b is typeof b & { variancePct: number } => b.variancePct !== null
      );
      const jobCount = withVariance.length;
      const base = { costCodeId: cc.id, code: cc.code, description: cc.description, unit: cc.unit, jobCount };

      if (jobCount === 0) {
        return { ...base, avgEstimatedRate: null, avgActualRate: null, avgVariancePct: null, consistency: null, verdict: "insufficient_data" as const };
      }

      const avgEstimatedRate = average(withVariance.map((b) => b.estimatedRate).filter((r): r is number => r !== null));
      const avgActualRate = average(withVariance.map((b) => b.actualRate).filter((r): r is number => r !== null));
      const avgVariancePct = average(withVariance.map((b) => b.variancePct))!;
      const sameSignCount = withVariance.filter((b) => Math.sign(b.variancePct) === Math.sign(avgVariancePct)).length;
      const consistency = sameSignCount / jobCount;

      let verdict: AccuracyVerdict;
      if (jobCount < MIN_JOBS_FOR_VERDICT) verdict = "insufficient_data";
      else if (Math.abs(avgVariancePct) < BIAS_THRESHOLD) verdict = "accurate";
      else if (consistency < CONSISTENCY_THRESHOLD) verdict = "inconsistent";
      else verdict = avgVariancePct > 0 ? "consistently_underestimated" : "consistently_overestimated";

      return { ...base, avgEstimatedRate, avgActualRate, avgVariancePct, consistency, verdict };
    })
    .filter((r) => r.jobCount > 0)
    .sort((a, b) => Math.abs(b.avgVariancePct ?? 0) - Math.abs(a.avgVariancePct ?? 0));

  return rows;
}
