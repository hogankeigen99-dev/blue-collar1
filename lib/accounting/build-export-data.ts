import { scopedPrisma } from "@/lib/tenant";
import { getJobCosting } from "@/lib/job-costing";
import { COST_CATEGORY_LABEL } from "@/lib/format";
import type { AccountingExportData, AccountingLineItem } from "@/lib/accounting/types";

/** Assembles one job's connector-agnostic export data: GL-coded cost
 * categories, approved change orders, and invoices. Returns null if the
 * job doesn't exist (or doesn't belong to this company). */
export async function buildAccountingExportData(companyId: string, jobId: string): Promise<AccountingExportData | null> {
  const prisma = scopedPrisma(companyId);

  const [job, costing, mappings, changeOrders, invoices] = await Promise.all([
    prisma.job.findFirst({ where: { id: jobId } }),
    getJobCosting(companyId, jobId).catch(() => null),
    prisma.accountingCategoryMapping.findMany(),
    prisma.changeOrder.findMany({ where: { jobId, status: "APPROVED" } }),
    prisma.invoice.findMany({ where: { jobId } }),
  ]);
  if (!job || !costing) return null;

  const mappingByCategory = Object.fromEntries(mappings.map((m) => [m.category, m]));
  const lineItems: AccountingLineItem[] = [];

  for (const c of costing.categories) {
    const mapping = mappingByCategory[c.category];
    lineItems.push({
      section: "Cost Category",
      type: "COST",
      glCode: mapping?.glCode ?? "",
      glAccountName: mapping?.glAccountName ?? "",
      description: COST_CATEGORY_LABEL[c.category],
      amount: c.actual,
      notes: `Estimated ${c.estimated.toFixed(2)} / Committed ${c.committed.toFixed(2)} / Projected ${c.projected.toFixed(2)}`,
    });
  }

  for (const co of changeOrders) {
    if (co.costAmount) {
      lineItems.push({
        section: "Change Order",
        type: "COST",
        glCode: "",
        glAccountName: "",
        description: co.title,
        amount: co.costAmount,
        notes: `Approved ${co.approvedAt?.toISOString().slice(0, 10) ?? ""}`,
      });
    }
    if (co.revenueAmount) {
      lineItems.push({
        section: "Change Order",
        type: "REVENUE",
        glCode: "",
        glAccountName: "",
        description: co.title,
        amount: co.revenueAmount,
        notes: `Approved ${co.approvedAt?.toISOString().slice(0, 10) ?? ""}`,
      });
    }
  }

  for (const inv of invoices) {
    lineItems.push({
      section: "Invoice",
      type: "REVENUE",
      glCode: "",
      glAccountName: "",
      description: inv.invoiceNumber,
      amount: inv.amount,
      notes: `Status: ${inv.status}, Date: ${inv.date.toISOString().slice(0, 10)}`,
    });
  }

  return {
    jobId: job.id,
    jobTitle: job.title,
    lineItems,
    totals: {
      contractValue: costing.contractValue,
      projectedFinalCost: costing.projectedFinalCost,
      projectedGrossProfit: costing.projectedGrossProfit,
      billedAmount: costing.billedAmount,
    },
  };
}
