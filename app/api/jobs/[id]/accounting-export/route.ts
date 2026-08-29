import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canManageEstimates } from "@/lib/auth";
import { getJobCosting } from "@/lib/job-costing";
import { COST_CATEGORY_LABEL } from "@/lib/format";

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(csvCell).join(",") + "\r\n";
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canManageEstimates(session.role)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const [job, costing, mappings, changeOrders, invoices] = await Promise.all([
    prisma.job.findUnique({ where: { id } }),
    getJobCosting(id).catch(() => null),
    prisma.accountingCategoryMapping.findMany(),
    prisma.changeOrder.findMany({ where: { jobId: id, status: "APPROVED" } }),
    prisma.invoice.findMany({ where: { jobId: id } }),
  ]);
  if (!job || !costing) return new NextResponse("Not found", { status: 404 });

  const mappingByCategory = Object.fromEntries(mappings.map((m) => [m.category, m]));

  let csv = csvRow(["Job", job.title]);
  csv += csvRow(["Job ID", job.id]);
  csv += csvRow([]);
  csv += csvRow(["Section", "Type", "GLCode", "GLAccountName", "Description", "Amount", "Notes"]);

  for (const c of costing.categories) {
    const mapping = mappingByCategory[c.category];
    csv += csvRow([
      "Cost Category",
      "COST",
      mapping?.glCode ?? "",
      mapping?.glAccountName ?? "",
      COST_CATEGORY_LABEL[c.category],
      c.actual.toFixed(2),
      `Estimated ${c.estimated.toFixed(2)} / Committed ${c.committed.toFixed(2)} / Projected ${c.projected.toFixed(2)}`,
    ]);
  }

  for (const co of changeOrders) {
    if (co.costAmount) {
      csv += csvRow(["Change Order", "COST", "", "", co.title, co.costAmount.toFixed(2), `Approved ${co.approvedAt?.toISOString().slice(0, 10) ?? ""}`]);
    }
    if (co.revenueAmount) {
      csv += csvRow(["Change Order", "REVENUE", "", "", co.title, co.revenueAmount.toFixed(2), `Approved ${co.approvedAt?.toISOString().slice(0, 10) ?? ""}`]);
    }
  }

  for (const inv of invoices) {
    csv += csvRow(["Invoice", "REVENUE", "", "", `${inv.invoiceNumber}`, inv.amount.toFixed(2), `Status: ${inv.status}, Date: ${inv.date.toISOString().slice(0, 10)}`]);
  }

  csv += csvRow([]);
  csv += csvRow(["Contract Value (incl. approved COs)", costing.contractValue.toFixed(2)]);
  csv += csvRow(["Projected Final Cost", costing.projectedFinalCost.toFixed(2)]);
  csv += csvRow(["Projected Gross Profit", costing.projectedGrossProfit.toFixed(2)]);
  csv += csvRow(["Billed To Date", costing.billedAmount.toFixed(2)]);

  const filename = `${job.title.replace(/[^a-z0-9]+/gi, "-")}-accounting-export.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
