import { scopedPrisma } from "@/lib/tenant";
import { getJobCosting, type CategoryCosting } from "@/lib/job-costing";
import { getBillingReadiness } from "@/lib/billing";

export type ProjectFinancials = {
  jobId: string;
  jobNumber: string;
  title: string;
  originalContractValue: number;
  approvedChangeOrderValue: number;
  currentContractValue: number;
  totalBudget: number;
  committedCost: number;
  actualCost: number;
  projectedFinalCost: number;
  projectedGrossProfit: number;
  projectedMarginPct: number | null;
  billingReady: boolean;
  invoicedAmount: number;
  categories: CategoryCosting[];
};

export type CompanyFinancials = {
  totals: {
    originalContractValue: number;
    approvedChangeOrderValue: number;
    currentContractValue: number;
    totalBudget: number;
    committedCost: number;
    actualCost: number;
    projectedFinalCost: number;
    projectedGrossProfit: number;
    projectedMarginPct: number | null;
    billingReadyValue: number;
    invoicedAmount: number;
  };
  categoryTotals: CategoryCosting[];
  losingMargin: ProjectFinancials[]; // projected margin below a healthy threshold
  overBudget: ProjectFinancials[]; // projected final cost > total budget
  billingBlocked: ProjectFinancials[]; // at closeout/complete but not billing-ready
  projects: ProjectFinancials[];
};

const MARGIN_HEALTHY_PCT = 0.1;
const CATEGORIES: CategoryCosting["category"][] = ["LABOR", "MATERIAL", "EQUIPMENT", "SUBCONTRACTOR", "OTHER"];

/**
 * The company financial operating view — what leadership needs before
 * accounting closes the month, not a general-ledger replacement. Every
 * project row is lib/job-costing.ts's getJobCosting() output plus billing
 * readiness, exactly what the job's own Command Center already shows;
 * this file only sums and buckets those existing per-job numbers.
 */
export async function getCompanyFinancials(companyId: string): Promise<CompanyFinancials> {
  const prisma = scopedPrisma(companyId);

  const jobs = await prisma.job.findMany({
    where: { status: { not: "CANCELLED" }, stage: { not: "COMPLETE" } },
    select: { id: true, jobNumber: true, title: true, contractValue: true, stage: true },
  });

  const projects: ProjectFinancials[] = await Promise.all(
    jobs.map(async (job) => {
      const [costing, readiness] = await Promise.all([
        getJobCosting(companyId, job.id),
        getBillingReadiness(companyId, job.id),
      ]);
      return {
        jobId: job.id,
        jobNumber: job.jobNumber,
        title: job.title,
        originalContractValue: job.contractValue ?? 0,
        approvedChangeOrderValue: costing.changeOrderRevenue,
        currentContractValue: costing.contractValue,
        totalBudget: costing.totalEstimated,
        committedCost: costing.totalCommitted,
        actualCost: costing.totalActual,
        projectedFinalCost: costing.projectedFinalCost,
        projectedGrossProfit: costing.projectedGrossProfit,
        projectedMarginPct: costing.projectedMarginPct,
        billingReady: readiness.ready,
        invoicedAmount: costing.billedAmount,
        categories: costing.categories,
      };
    })
  );

  const totals = projects.reduce(
    (acc, p) => ({
      originalContractValue: acc.originalContractValue + p.originalContractValue,
      approvedChangeOrderValue: acc.approvedChangeOrderValue + p.approvedChangeOrderValue,
      currentContractValue: acc.currentContractValue + p.currentContractValue,
      totalBudget: acc.totalBudget + p.totalBudget,
      committedCost: acc.committedCost + p.committedCost,
      actualCost: acc.actualCost + p.actualCost,
      projectedFinalCost: acc.projectedFinalCost + p.projectedFinalCost,
      projectedGrossProfit: acc.projectedGrossProfit + p.projectedGrossProfit,
      projectedMarginPct: null, // computed below from the summed figures, not averaged per-project
      billingReadyValue: acc.billingReadyValue + (p.billingReady ? p.currentContractValue : 0),
      invoicedAmount: acc.invoicedAmount + p.invoicedAmount,
    }),
    {
      originalContractValue: 0,
      approvedChangeOrderValue: 0,
      currentContractValue: 0,
      totalBudget: 0,
      committedCost: 0,
      actualCost: 0,
      projectedFinalCost: 0,
      projectedGrossProfit: 0,
      projectedMarginPct: null as number | null,
      billingReadyValue: 0,
      invoicedAmount: 0,
    }
  );
  totals.projectedMarginPct = totals.currentContractValue > 0 ? totals.projectedGrossProfit / totals.currentContractValue : null;

  const categoryTotals: CategoryCosting[] = CATEGORIES.map((category) => {
    const rows = projects.flatMap((p) => p.categories.filter((c) => c.category === category));
    return {
      category,
      estimated: rows.reduce((s, r) => s + r.estimated, 0),
      committed: rows.reduce((s, r) => s + r.committed, 0),
      actual: rows.reduce((s, r) => s + r.actual, 0),
      projected: rows.reduce((s, r) => s + r.projected, 0),
    };
  });

  const losingMargin = projects
    .filter((p) => p.projectedMarginPct !== null && p.projectedMarginPct < MARGIN_HEALTHY_PCT)
    .sort((a, b) => (a.projectedMarginPct ?? 0) - (b.projectedMarginPct ?? 0));
  const overBudget = projects
    .filter((p) => p.totalBudget > 0 && p.projectedFinalCost > p.totalBudget)
    .sort((a, b) => b.projectedFinalCost - b.totalBudget - (a.projectedFinalCost - a.totalBudget));
  const billingBlocked = projects
    .filter((p) => !p.billingReady && (jobs.find((j) => j.id === p.jobId)?.stage === "CLOSEOUT" || jobs.find((j) => j.id === p.jobId)?.stage === "COMPLETE"))
    .sort((a, b) => b.currentContractValue - a.currentContractValue);

  return { totals, categoryTotals, losingMargin, overBudget, billingBlocked, projects };
}
