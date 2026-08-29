import { scopedPrisma } from "@/lib/tenant";
import { getProjectHealth } from "@/lib/project-health";
import type { AlertType } from "@/lib/alerts";

export type PortfolioRiskLevel = "none" | "watch" | "critical";

export type PortfolioRow = {
  jobId: string;
  jobNumber: string;
  title: string;
  customerName: string | null;
  projectType: string | null;
  pmName: string | null;
  foremanName: string | null;
  crew: string[];
  stage: string;
  targetStartDate: Date | null;
  targetEndDate: Date | null;
  currentContractValue: number;
  schedulePct: number | null;
  productionPct: number | null;
  estimatedLaborHours: number;
  actualLaborHours: number;
  projectedLaborHours: number;
  laborHoursVariancePct: number | null;
  actualCost: number;
  projectedFinalCost: number;
  projectedGrossProfit: number;
  projectedMarginPct: number | null;
  openChangeOrderValue: number;
  billingReady: boolean;
  scheduleRisk: boolean;
  laborRisk: boolean;
  marginRisk: boolean;
  riskLevel: PortfolioRiskLevel;
};

export type PortfolioFilters = {
  pmUserId?: string;
  foremanWorkerId?: string;
  projectType?: string;
  stage?: string;
  risk?: "schedule" | "labor" | "margin" | "billing_blocked";
  includeComplete?: boolean;
};

const RISK_TYPES: AlertType[] = ["SCHEDULE_RISK", "LABOR_OVERRUN", "MARGIN_RISK"];

/**
 * The company-wide Project Portfolio — one row per job, every column
 * derived from the same getProjectHealth() the job's own Command Center
 * already computes, so a portfolio number and the number you see after
 * clicking into the job are never two different calculations of the same
 * thing.
 */
export async function getProjectPortfolio(companyId: string, filters: PortfolioFilters = {}): Promise<PortfolioRow[]> {
  const prisma = scopedPrisma(companyId);

  const jobs = await prisma.job.findMany({
    where: {
      status: { not: "CANCELLED" },
      stage: filters.includeComplete ? undefined : { not: "COMPLETE" },
      pmUserId: filters.pmUserId,
      foremanWorkerId: filters.foremanWorkerId,
      projectType: filters.projectType,
    },
    select: { id: true },
  });

  const healths = await Promise.all(jobs.map((j) => getProjectHealth(companyId, j.id)));

  const rows: PortfolioRow[] = healths.map((h) => {
    const scheduleRisk = h.exceptions.some((e) => e.type === "SCHEDULE_RISK");
    const laborRisk = h.exceptions.some((e) => e.type === "LABOR_OVERRUN");
    const marginRisk = h.exceptions.some((e) => e.type === "MARGIN_RISK");
    const hasCritical = h.exceptions.some((e) => e.severity === "critical" && RISK_TYPES.includes(e.type));
    const hasWatch = scheduleRisk || laborRisk || marginRisk;
    const openChangeOrderValue = h.exceptions.some((e) => e.type === "UNAPPROVED_CHANGE_WORK")
      ? h.currentContractValue - h.originalContractValue - h.approvedChangeOrderRevenue
      : 0;

    return {
      jobId: h.jobId,
      jobNumber: h.jobNumber,
      title: h.title,
      customerName: h.customerName,
      projectType: null, // filled in below from a lightweight join — see note
      pmName: h.pmName,
      foremanName: h.foremanName,
      crew: h.crew,
      stage: h.stage,
      targetStartDate: h.targetStartDate,
      targetEndDate: h.targetEndDate,
      currentContractValue: h.currentContractValue,
      schedulePct: h.schedulePct,
      productionPct: h.productionPct,
      estimatedLaborHours: h.estimatedLaborHours,
      actualLaborHours: h.actualLaborHours,
      projectedLaborHours: h.projectedLaborHours,
      laborHoursVariancePct: h.laborHoursVariancePct,
      actualCost: h.actualLaborCost + h.materialActual + h.equipmentActual + h.subcontractorActual,
      projectedFinalCost: h.projectedFinalCost,
      projectedGrossProfit: h.projectedGrossProfit,
      projectedMarginPct: h.projectedMarginPct,
      openChangeOrderValue,
      billingReady: h.billingReadiness.ready,
      scheduleRisk,
      laborRisk,
      marginRisk,
      riskLevel: hasCritical ? "critical" : hasWatch ? "watch" : "none",
    };
  });

  // projectType isn't on ProjectHealth (it's a Job-only filter/classification
  // field, not part of the per-job operational health computation) — one
  // extra lightweight lookup rather than adding it to ProjectHealth's shape
  // for every other caller that doesn't need it.
  const projectTypes = await prisma.job.findMany({
    where: { id: { in: rows.map((r) => r.jobId) } },
    select: { id: true, projectType: true },
  });
  const projectTypeById = new Map(projectTypes.map((j) => [j.id, j.projectType]));
  for (const row of rows) row.projectType = projectTypeById.get(row.jobId) ?? null;

  let filtered = rows;
  if (filters.risk === "schedule") filtered = filtered.filter((r) => r.scheduleRisk);
  else if (filters.risk === "labor") filtered = filtered.filter((r) => r.laborRisk);
  else if (filters.risk === "margin") filtered = filtered.filter((r) => r.marginRisk);
  else if (filters.risk === "billing_blocked") filtered = filtered.filter((r) => !r.billingReady && (r.stage === "CLOSEOUT" || r.stage === "COMPLETE"));

  return filtered;
}
