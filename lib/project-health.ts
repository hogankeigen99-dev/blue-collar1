import { scopedPrisma } from "@/lib/tenant";
import { computeProgress } from "@/lib/productivity";
import { getJobCosting } from "@/lib/job-costing";
import { getBillingReadiness, type BillingReadiness } from "@/lib/billing";
import { getJobAlerts, type Alert } from "@/lib/alerts";

const DAY_MS = 86_400_000;

export type ProjectHealth = {
  // Identity
  jobId: string;
  jobNumber: string;
  title: string;
  customerName: string | null;
  location: string | null;
  pmName: string | null;
  foremanName: string | null;
  crew: string[]; // formally-assigned worker names
  permitNumber: string | null;
  permitIssuedDate: Date | null;
  permitExpirationDate: Date | null;
  permitExpired: boolean;

  // Timeline
  stage: string;
  status: string;
  targetStartDate: Date | null;
  targetEndDate: Date | null;
  plannedDurationDays: number | null; // inclusive of both start and end date
  currentDay: number | null; // 1-indexed day of project, clamped to plannedDurationDays
  schedulePct: number | null; // time-based: days elapsed / planned duration
  productionPct: number | null; // work-based: actual qty / estimated qty across cost codes

  // Labor
  estimatedLaborHours: number;
  actualLaborHours: number;
  laborHoursVariance: number; // actual - estimated
  laborHoursVariancePct: number | null;
  estimatedLaborCost: number;
  actualLaborCost: number;
  // The PM forecast (item 6): what labor lands at if the job finishes at
  // today's actual burn rate, not just what's been spent so far.
  projectedLaborHours: number;
  projectedLaborCost: number;

  // Cost categories
  materialBudget: number;
  materialActual: number;
  equipmentBudget: number;
  equipmentActual: number;
  subcontractorBudget: number;
  subcontractorActual: number;

  // Contract / profitability
  approvedChangeOrderCount: number;
  approvedChangeOrderRevenue: number;
  originalContractValue: number;
  currentContractValue: number;
  projectedFinalCost: number;
  projectedGrossProfit: number;
  projectedMarginPct: number | null;

  // Status
  billingReadiness: BillingReadiness;
  exceptions: Alert[];
};

/** One consolidated fetch for the job Command Center — every field the PM
 * needs to understand project health in ~10 seconds, computed once instead
 * of scattered across several page-level queries. */
export async function getProjectHealth(companyId: string, jobId: string): Promise<ProjectHealth> {
  const prisma = scopedPrisma(companyId);

  const [job, jobCostCodes, costing, billingReadiness, exceptions] = await Promise.all([
    prisma.job.findFirstOrThrow({
      where: { id: jobId },
      include: {
        customer: true,
        pm: true,
        foreman: true,
        assignments: { include: { worker: true } },
        changeOrders: true,
      },
    }),
    prisma.jobCostCode.findMany({ where: { jobId }, include: { entries: true } }),
    getJobCosting(companyId, jobId),
    getBillingReadiness(companyId, jobId),
    getJobAlerts(companyId, jobId),
  ]);

  // --- Timeline: day-of-project + schedule% (time-based) vs production% (work-based) ---
  let plannedDurationDays: number | null = null;
  let currentDay: number | null = null;
  let schedulePct: number | null = null;
  if (job.targetStartDate && job.targetEndDate) {
    plannedDurationDays = Math.round((job.targetEndDate.getTime() - job.targetStartDate.getTime()) / DAY_MS) + 1;
    const daysElapsed = Math.floor((Date.now() - job.targetStartDate.getTime()) / DAY_MS) + 1;
    currentDay = Math.max(1, Math.min(daysElapsed, plannedDurationDays));
    schedulePct = plannedDurationDays > 0 ? Math.max(0, Math.min(1, daysElapsed / plannedDurationDays)) : null;
  }

  const totalEstQty = jobCostCodes.reduce((s, jcc) => s + jcc.estimatedQty, 0);
  const totalActQty = jobCostCodes.reduce(
    (s, jcc) => s + jcc.entries.reduce((es, e) => es + e.quantity, 0),
    0
  );
  const productionPct = totalEstQty > 0 ? totalActQty / totalEstQty : null;

  // --- Labor hours ---
  const estimatedLaborHours = jobCostCodes.reduce((s, jcc) => s + jcc.estimatedHours, 0);
  const actualLaborHours = jobCostCodes.reduce((s, jcc) => {
    const progress = computeProgress(jcc.estimatedQty, jcc.estimatedHours, jcc.entries);
    return s + progress.actualHours;
  }, 0);
  const laborHoursVariance = actualLaborHours - estimatedLaborHours;
  const laborHoursVariancePct = estimatedLaborHours > 0 ? laborHoursVariance / estimatedLaborHours : null;

  const laborCategory = costing.categories.find((c) => c.category === "LABOR")!;
  const materialCategory = costing.categories.find((c) => c.category === "MATERIAL")!;
  const equipmentCategory = costing.categories.find((c) => c.category === "EQUIPMENT")!;
  const subcontractorCategory = costing.categories.find((c) => c.category === "SUBCONTRACTOR")!;

  const approvedCOs = job.changeOrders.filter((co) => co.status === "APPROVED");

  return {
    jobId: job.id,
    jobNumber: job.jobNumber,
    title: job.title,
    customerName: job.customer?.name ?? null,
    location: job.address,
    pmName: job.pm?.name ?? null,
    foremanName: job.foreman?.name ?? null,
    crew: job.assignments.map((a) => a.worker.name),
    permitNumber: job.permitNumber,
    permitIssuedDate: job.permitIssuedDate,
    permitExpirationDate: job.permitExpirationDate,
    permitExpired: job.permitExpirationDate !== null && job.permitExpirationDate.getTime() < Date.now() && job.stage !== "COMPLETE",

    stage: job.stage,
    status: job.status,
    targetStartDate: job.targetStartDate,
    targetEndDate: job.targetEndDate,
    plannedDurationDays,
    currentDay,
    schedulePct,
    productionPct,

    estimatedLaborHours,
    actualLaborHours,
    laborHoursVariance,
    laborHoursVariancePct,
    estimatedLaborCost: laborCategory.estimated,
    actualLaborCost: laborCategory.actual,
    projectedLaborHours: costing.projectedLaborHours,
    projectedLaborCost: costing.projectedLaborCost,

    materialBudget: materialCategory.estimated,
    materialActual: materialCategory.actual,
    equipmentBudget: equipmentCategory.estimated,
    equipmentActual: equipmentCategory.actual,
    subcontractorBudget: subcontractorCategory.estimated,
    subcontractorActual: subcontractorCategory.actual,

    approvedChangeOrderCount: approvedCOs.length,
    approvedChangeOrderRevenue: costing.changeOrderRevenue,
    originalContractValue: job.contractValue ?? 0,
    currentContractValue: costing.contractValue,
    projectedFinalCost: costing.projectedFinalCost,
    projectedGrossProfit: costing.projectedGrossProfit,
    projectedMarginPct: costing.projectedMarginPct,

    billingReadiness,
    exceptions,
  };
}
