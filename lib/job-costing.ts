import { scopedPrisma } from "@/lib/tenant";
import { computeProgress } from "@/lib/productivity";

/** Fallback blended crew rate ($/hr) used only when neither the entry's worker nor any worker on the job has a laborRate set. */
const DEFAULT_LABOR_RATE = 55;

export type CategoryCosting = {
  category: "LABOR" | "MATERIAL" | "EQUIPMENT" | "SUBCONTRACTOR" | "OTHER";
  estimated: number;
  committed: number;
  actual: number;
  projected: number;
};

export type JobCosting = {
  categories: CategoryCosting[];
  totalEstimated: number;
  totalCommitted: number;
  totalActual: number;
  totalProjected: number;
  changeOrderRevenue: number;
  changeOrderCost: number;
  contractValue: number;
  billedAmount: number;
  projectedFinalCost: number;
  projectedGrossProfit: number;
  projectedMarginPct: number | null;
  /** Item 6 — the PM forecast: total labor hours/cost at completion across
   * every cost code, at each line's current actual burn rate. */
  projectedLaborHours: number;
  projectedLaborCost: number;
};

export async function getJobCosting(companyId: string, jobId: string): Promise<JobCosting> {
  const prisma = scopedPrisma(companyId);
  const [job, budgets, jobCostCodes, materialRequests, equipmentAssignments, subcontractorCosts, changeOrders, invoices, contract] =
    await Promise.all([
      prisma.job.findFirstOrThrow({ where: { id: jobId } }),
      prisma.jobBudget.findMany({ where: { jobId } }),
      prisma.jobCostCode.findMany({ where: { jobId }, include: { entries: { include: { enteredBy: true } } } }),
      prisma.materialRequest.findMany({ where: { jobId } }),
      prisma.equipmentAssignment.findMany({ where: { jobId }, include: { equipment: true } }),
      prisma.subcontractorCost.findMany({ where: { jobId } }),
      prisma.changeOrder.findMany({ where: { jobId } }),
      prisma.invoice.findMany({ where: { jobId, status: { in: ["SENT", "PAID"] } } }),
      prisma.contract.findFirst({ where: { jobId }, include: { lines: true } }),
    ]);

  const estimatedByCategory = Object.fromEntries(budgets.map((b) => [b.category, b.estimatedAmount]));

  // --- Labor: priced from actual logged hours, projected from current burn rate ---
  const allEntries = jobCostCodes.flatMap((jcc) => jcc.entries);
  const ratedEntries = allEntries.filter((e) => e.enteredBy?.laborRate != null);
  const jobAverageRate =
    ratedEntries.length > 0
      ? ratedEntries.reduce((s, e) => s + (e.enteredBy!.laborRate ?? 0), 0) / ratedEntries.length
      : DEFAULT_LABOR_RATE;

  let actualLaborCost = 0;
  let projectedLaborCost = 0;
  let projectedLaborHours = 0;
  for (const jcc of jobCostCodes) {
    const progress = computeProgress(jcc.estimatedQty, jcc.estimatedHours, jcc.entries);
    for (const e of jcc.entries) {
      actualLaborCost += e.hours * (e.enteredBy?.laborRate ?? jobAverageRate);
    }
    projectedLaborHours += progress.projectedHours;
    projectedLaborCost += progress.projectedHours * jobAverageRate;
  }

  // --- Material: committed once a PO exists, actual once received ---
  const committedStatuses = new Set(["PO_ISSUED", "ORDERED", "RECEIVED"]);
  const materialCommitted = materialRequests
    .filter((m) => committedStatuses.has(m.status))
    .reduce((s, m) => s + (m.totalCost ?? 0), 0);
  const materialActual = materialRequests
    .filter((m) => m.status === "RECEIVED")
    .reduce((s, m) => s + (m.totalCost ?? 0), 0);

  // --- Equipment: committed = planned days * rate, actual = actual days used * rate ---
  const dayMs = 24 * 60 * 60 * 1000;
  let equipmentCommitted = 0;
  let equipmentActual = 0;
  for (const a of equipmentAssignments) {
    const rate = a.equipment.dailyRentalCost ?? 0;
    const plannedDays = Math.max(1, Math.round((a.endDate.getTime() - a.startDate.getTime()) / dayMs) + 1);
    equipmentCommitted += plannedDays * rate;
    if (a.actualPickupDate && a.actualReturnDate) {
      const actualDays = Math.max(1, Math.round((a.actualReturnDate.getTime() - a.actualPickupDate.getTime()) / dayMs) + 1);
      equipmentActual += actualDays * rate;
    }
  }

  // --- Subcontractor ---
  const subCommitted = subcontractorCosts.reduce((s, c) => s + c.committedAmount, 0);
  const subActual = subcontractorCosts.reduce((s, c) => s + c.actualAmount, 0);

  const categories: CategoryCosting[] = [
    {
      category: "LABOR",
      estimated: estimatedByCategory.LABOR ?? 0,
      committed: actualLaborCost,
      actual: actualLaborCost,
      projected: Math.max(projectedLaborCost, actualLaborCost),
    },
    {
      category: "MATERIAL",
      estimated: estimatedByCategory.MATERIAL ?? 0,
      committed: materialCommitted,
      actual: materialActual,
      projected: Math.max(estimatedByCategory.MATERIAL ?? 0, materialCommitted, materialActual),
    },
    {
      category: "EQUIPMENT",
      estimated: estimatedByCategory.EQUIPMENT ?? 0,
      committed: equipmentCommitted,
      actual: equipmentActual,
      projected: Math.max(estimatedByCategory.EQUIPMENT ?? 0, equipmentCommitted, equipmentActual),
    },
    {
      category: "SUBCONTRACTOR",
      estimated: estimatedByCategory.SUBCONTRACTOR ?? 0,
      committed: subCommitted,
      actual: subActual,
      projected: Math.max(estimatedByCategory.SUBCONTRACTOR ?? 0, subCommitted, subActual),
    },
    {
      category: "OTHER",
      estimated: estimatedByCategory.OTHER ?? 0,
      committed: 0,
      actual: 0,
      projected: estimatedByCategory.OTHER ?? 0,
    },
  ];

  const approvedCOs = changeOrders.filter((co) => co.status === "APPROVED");
  const changeOrderRevenue = approvedCOs.reduce((s, co) => s + (co.revenueAmount ?? 0), 0);
  const changeOrderCost = approvedCOs.reduce((s, co) => s + (co.costAmount ?? 0), 0);

  const totalEstimated = categories.reduce((s, c) => s + c.estimated, 0);
  const totalCommitted = categories.reduce((s, c) => s + c.committed, 0);
  const totalActual = categories.reduce((s, c) => s + c.actual, 0);
  const totalProjected = categories.reduce((s, c) => s + c.projected, 0);

  // Contract.lines (the Schedule of Values) is the source of truth once a
  // job has a real Contract — an approved change order's revenue is
  // already baked in there as its own CO-sourced line (see
  // lib/change-order-actions.ts), so it isn't added a second time here.
  // Falls back to the flat field + change-order revenue for the handful of
  // historical-anchor seed jobs that were never given a real Contract.
  const contractValue = contract
    ? contract.lines.reduce((s, l) => s + l.scheduledValue, 0)
    : (job.contractValue ?? 0) + changeOrderRevenue;
  const projectedFinalCost = totalProjected + changeOrderCost;
  const projectedGrossProfit = contractValue - projectedFinalCost;
  const projectedMarginPct = contractValue > 0 ? projectedGrossProfit / contractValue : null;

  return {
    categories,
    totalEstimated,
    totalCommitted,
    totalActual,
    totalProjected,
    changeOrderRevenue,
    changeOrderCost,
    contractValue,
    billedAmount: invoices.reduce((s, i) => s + i.amount, 0),
    projectedFinalCost,
    projectedGrossProfit,
    projectedMarginPct,
    projectedLaborHours,
    projectedLaborCost,
  };
}
