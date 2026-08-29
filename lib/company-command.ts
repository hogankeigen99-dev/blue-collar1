import { scopedPrisma } from "@/lib/tenant";
import { getProjectHealth, type ProjectHealth } from "@/lib/project-health";
import { getJobCosting } from "@/lib/job-costing";
import { getWinRateReport } from "@/lib/opportunities";
import type { Alert } from "@/lib/alerts";
import { dateKey } from "@/lib/schedule";

const DAY_MS = 86_400_000;
const STARTING_SOON_DAYS = 7;
const NEARING_COMPLETION_DAYS = 7;
const TREND_WINDOW_DAYS = 90;

export type JobRef = { jobId: string; jobNumber: string; title: string; detail: string };

export type CompanyCommand = {
  generatedAt: Date;

  // Pipeline (Opportunity -> Bid -> Estimate, before Award)
  pipelineOpenCount: number;
  pipelineValue: number;
  pipelineWinRatePct: number | null;

  // Active operations
  activeProjectCount: number;
  startingSoon: JobRef[];
  nearingCompletion: JobRef[];
  behindSchedule: JobRef[];
  laborRisk: JobRef[];
  marginRisk: JobRef[];
  materialRisk: JobRef[];
  equipmentIssues: JobRef[];
  unresolvedChangeWork: JobRef[];

  // Financial performance
  originalContractValue: number;
  approvedChangeOrderValue: number;
  currentContractValue: number;
  totalBudget: number;
  actualCost: number;
  committedCost: number;
  projectedFinalCost: number;
  projectedGrossProfit: number;
  projectedGrossMarginPct: number | null;
  billingReadyValue: number;
  billingReadyCount: number;
  invoicedAmount: number;
  openChangeOrderCount: number;
  openChangeOrderExposure: number;

  // Labor
  estimatedLaborHours: number;
  actualLaborHours: number;
  projectedLaborHours: number;
  laborVarianceHours: number;
  laborVariancePct: number | null;
  projectsOverProductivity: number;
  productivityTrend: { recentAvgVariancePct: number | null; priorAvgVariancePct: number | null };

  // Resources
  activeCrewCount: number;
  workersAssignedToday: number;
  workersAvailableToday: number;
  totalActiveWorkers: number;
  crewUtilizationPct: number | null;
  equipmentAssignedCount: number;
  equipmentConflictCount: number;

  topExceptions: (Alert & { contractValue: number })[];
};

function jobRef(h: ProjectHealth, detail: string): JobRef {
  return { jobId: h.jobId, jobNumber: h.jobNumber, title: h.title, detail };
}

function average(nums: number[]): number | null {
  return nums.length > 0 ? nums.reduce((s, n) => s + n, 0) / nums.length : null;
}

/**
 * The company-wide rollup that powers the Company Command Center — every
 * number here is either a sum/average over the per-job getProjectHealth()
 * result (the same computation the job Command Center already shows, so a
 * drill-down from a company total lands on numbers that already add up to
 * it) or a lightweight company-scoped query for facts getProjectHealth
 * doesn't carry (open change-order exposure, resource utilization,
 * productivity trend). Nothing here is stored — it's recomputed live.
 */
export async function getCompanyCommand(companyId: string): Promise<CompanyCommand> {
  const prisma = scopedPrisma(companyId);
  const now = Date.now();
  const todayKey = dateKey(new Date(now));

  const [openJobs, winRate] = await Promise.all([
    prisma.job.findMany({
      where: { status: { not: "CANCELLED" }, stage: { not: "COMPLETE" } },
      select: { id: true },
    }),
    getWinRateReport(companyId),
  ]);
  const healths = await Promise.all(openJobs.map((j) => getProjectHealth(companyId, j.id)));

  const startingSoon: JobRef[] = [];
  const nearingCompletion: JobRef[] = [];
  const behindSchedule: JobRef[] = [];
  const laborRisk: JobRef[] = [];
  const marginRisk: JobRef[] = [];
  const materialRisk: JobRef[] = [];
  const equipmentIssues: JobRef[] = [];
  const unresolvedChangeWork: JobRef[] = [];

  let activeProjectCount = 0;
  let originalContractValue = 0;
  let approvedChangeOrderValue = 0;
  let currentContractValue = 0;
  let actualCost = 0;
  let projectedFinalCost = 0;
  let projectedGrossProfit = 0;
  let billingReadyValue = 0;
  let billingReadyCount = 0;
  let invoicedAmount = 0;
  let estimatedLaborHours = 0;
  let actualLaborHours = 0;
  let projectedLaborHours = 0;
  let projectsOverProductivity = 0;
  const topExceptions: (Alert & { contractValue: number })[] = [];

  for (const h of healths) {
    const active = h.stage === "MOBILIZATION" || h.stage === "ACTIVE" || h.stage === "PUNCH_LIST" || h.stage === "CLOSEOUT";
    if (active) activeProjectCount++;

    if (h.targetStartDate && (h.stage === "PRECON" || h.stage === "MOBILIZATION")) {
      const daysToStart = Math.floor((h.targetStartDate.getTime() - now) / DAY_MS);
      if (daysToStart >= 0 && daysToStart <= STARTING_SOON_DAYS) {
        startingSoon.push(jobRef(h, `Starts in ${daysToStart} day(s)`));
      }
    }
    if (h.targetEndDate && active) {
      const daysToFinish = Math.floor((h.targetEndDate.getTime() - now) / DAY_MS);
      if (daysToFinish >= 0 && daysToFinish <= NEARING_COMPLETION_DAYS) {
        nearingCompletion.push(jobRef(h, `Target finish in ${daysToFinish} day(s)`));
      }
    }

    const hasType = (t: Alert["type"]) => h.exceptions.some((e) => e.type === t);
    if (hasType("SCHEDULE_RISK")) behindSchedule.push(jobRef(h, "Behind target finish date"));
    const laborOverrunAlert = h.exceptions.find((e) => e.type === "LABOR_OVERRUN");
    if (laborOverrunAlert) {
      // Use the specific cost code's own alert message, not the job-level
      // aggregate variance — a job can be critically over on one cost code
      // while another, not-yet-started line drags the job-wide total the
      // other way, which would otherwise show a misleading "under" figure
      // right next to a flag that says "over."
      laborRisk.push(jobRef(h, laborOverrunAlert.message));
      projectsOverProductivity++;
    }
    if (hasType("MARGIN_RISK")) marginRisk.push(jobRef(h, `Projected margin ${h.projectedMarginPct !== null ? `${(h.projectedMarginPct * 100).toFixed(1)}%` : "n/a"}`));
    if (hasType("MATERIAL_RISK")) materialRisk.push(jobRef(h, "Material past expected delivery"));
    if (hasType("EQUIPMENT_ISSUE")) equipmentIssues.push(jobRef(h, "Equipment issue flagged"));
    if (hasType("UNAPPROVED_CHANGE_WORK")) unresolvedChangeWork.push(jobRef(h, "Change work not yet approved"));

    originalContractValue += h.originalContractValue;
    approvedChangeOrderValue += h.approvedChangeOrderRevenue;
    currentContractValue += h.currentContractValue;
    actualCost += h.actualLaborCost + h.materialActual + h.equipmentActual + h.subcontractorActual;
    projectedFinalCost += h.projectedFinalCost;
    projectedGrossProfit += h.projectedGrossProfit;
    if (h.billingReadiness.ready) {
      billingReadyValue += h.currentContractValue;
      billingReadyCount++;
    }
    estimatedLaborHours += h.estimatedLaborHours;
    actualLaborHours += h.actualLaborHours;
    projectedLaborHours += h.projectedLaborHours;

    for (const e of h.exceptions) topExceptions.push({ ...e, contractValue: h.currentContractValue });
  }

  // Total budget and committed cost aren't on ProjectHealth (it only carries
  // labor's estimated cost, not the other categories' budgets) — one
  // lightweight extra pass over the same open jobs' costing categories.
  const jobBudgets = await prisma.jobBudget.findMany({ where: { job: { id: { in: openJobs.map((j) => j.id) } } } });
  const totalBudget = jobBudgets.reduce((s, b) => s + b.estimatedAmount, 0);

  const invoices = await prisma.invoice.findMany({
    where: { jobId: { in: openJobs.map((j) => j.id) }, status: { in: ["SENT", "PAID"] } },
  });
  invoicedAmount = invoices.reduce((s, i) => s + i.amount, 0);

  const pendingCOs = await prisma.changeOrder.findMany({
    where: { jobId: { in: openJobs.map((j) => j.id) }, status: { in: ["IDENTIFIED", "PRICED", "SUBMITTED"] } },
  });
  const openChangeOrderCount = pendingCOs.length;
  const openChangeOrderExposure = pendingCOs.reduce((s, co) => s + (co.costAmount ?? 0), 0);

  // Committed cost: sum each open job's per-category "committed" figure —
  // the one job-costing number ProjectHealth doesn't surface individually
  // (it only exposes actual/budget per category, not committed), so this
  // reuses getJobCosting directly rather than re-deriving it.
  const costings = await Promise.all(openJobs.map((j) => getJobCosting(companyId, j.id)));
  const committedCost = costings.reduce((s, c) => s + c.totalCommitted, 0);

  const projectedGrossMarginPct = currentContractValue > 0 ? projectedGrossProfit / currentContractValue : null;
  const laborVarianceHours = actualLaborHours - estimatedLaborHours;
  const laborVariancePct = estimatedLaborHours > 0 ? laborVarianceHours / estimatedLaborHours : null;

  // Productivity trend: average at-completion variance for jobs benchmarked
  // in the last 90 days vs. the 90 days before that — a real trend from the
  // same CostCodeBenchmark snapshots the estimate/actual loop already
  // records, not a fabricated sparkline.
  const [recentBenchmarks, priorBenchmarks] = await Promise.all([
    prisma.costCodeBenchmark.findMany({ where: { recordedAt: { gte: new Date(now - TREND_WINDOW_DAYS * DAY_MS) } } }),
    prisma.costCodeBenchmark.findMany({
      where: { recordedAt: { gte: new Date(now - 2 * TREND_WINDOW_DAYS * DAY_MS), lt: new Date(now - TREND_WINDOW_DAYS * DAY_MS) } },
    }),
  ]);
  const productivityTrend = {
    recentAvgVariancePct: average(recentBenchmarks.map((b) => b.variancePct).filter((v): v is number => v !== null)),
    priorAvgVariancePct: average(priorBenchmarks.map((b) => b.variancePct).filter((v): v is number => v !== null)),
  };

  // Resources: crews/workers scheduled today, availability, equipment.
  const [activeWorkers, scheduledToday, unavailableToday, equipmentAssignments, foremenOnOpenJobs] = await Promise.all([
    prisma.worker.count({ where: { active: true } }),
    prisma.scheduleAssignment.findMany({ where: { date: new Date(`${todayKey}T00:00:00.000Z`) }, select: { workerId: true } }),
    prisma.workerUnavailability.findMany({ where: { date: new Date(`${todayKey}T00:00:00.000Z`) }, select: { workerId: true } }),
    prisma.equipmentAssignment.findMany({
      where: { jobId: { in: openJobs.map((j) => j.id) }, actualReturnDate: null },
      include: { equipment: true },
    }),
    prisma.job.findMany({
      where: { id: { in: openJobs.map((j) => j.id) }, foremanWorkerId: { not: null } },
      select: { foremanWorkerId: true },
      distinct: ["foremanWorkerId"],
    }),
  ]);
  const workersAssignedToday = new Set(scheduledToday.map((s) => s.workerId)).size;
  const unavailableWorkerIds = new Set(unavailableToday.map((u) => u.workerId));
  const workersAvailableToday = Math.max(0, activeWorkers - unavailableWorkerIds.size);
  const crewUtilizationPct = workersAvailableToday > 0 ? workersAssignedToday / workersAvailableToday : null;

  // Equipment conflicts: same equipment with two or more currently-open
  // (not yet returned) assignments whose planned windows overlap.
  const byEquipment = new Map<string, typeof equipmentAssignments>();
  for (const a of equipmentAssignments) {
    const list = byEquipment.get(a.equipmentId) ?? [];
    list.push(a);
    byEquipment.set(a.equipmentId, list);
  }
  let equipmentConflictCount = 0;
  for (const list of byEquipment.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[i].startDate <= list[j].endDate && list[j].startDate <= list[i].endDate) {
          equipmentConflictCount++;
        }
      }
    }
  }

  topExceptions.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return b.contractValue - a.contractValue;
  });

  return {
    generatedAt: new Date(),
    pipelineOpenCount: winRate.openCount,
    pipelineValue: winRate.openValue,
    pipelineWinRatePct: winRate.overallWinRatePct,
    activeProjectCount,
    startingSoon,
    nearingCompletion,
    behindSchedule,
    laborRisk,
    marginRisk,
    materialRisk,
    equipmentIssues,
    unresolvedChangeWork,

    originalContractValue,
    approvedChangeOrderValue,
    currentContractValue,
    totalBudget,
    actualCost,
    committedCost,
    projectedFinalCost,
    projectedGrossProfit,
    projectedGrossMarginPct,
    billingReadyValue,
    billingReadyCount,
    invoicedAmount,
    openChangeOrderCount,
    openChangeOrderExposure,

    estimatedLaborHours,
    actualLaborHours,
    projectedLaborHours,
    laborVarianceHours,
    laborVariancePct,
    projectsOverProductivity,
    productivityTrend,

    activeCrewCount: foremenOnOpenJobs.length,
    workersAssignedToday,
    workersAvailableToday,
    totalActiveWorkers: activeWorkers,
    crewUtilizationPct,
    equipmentAssignedCount: equipmentAssignments.length,
    equipmentConflictCount,

    topExceptions: topExceptions.slice(0, 10),
  };
}
