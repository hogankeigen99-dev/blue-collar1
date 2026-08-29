import type { AccountingConnector, AccountingExportData, AccountingExportResult } from "@/lib/accounting/types";

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(csvCell).join(",") + "\r\n";
}

/** Formats a file for hand import into whatever accounting system the
 * company already uses (QuickBooks, Sage, Foundation, ...) — the "integrate
 * instead of replace" approach until a direct API connector exists for a
 * given provider. */
export class CsvAccountingConnector implements AccountingConnector {
  readonly id = "CSV";
  readonly label = "CSV (manual import)";

  async export(data: AccountingExportData): Promise<AccountingExportResult> {
    let csv = csvRow(["Job", data.jobTitle]);
    csv += csvRow(["Job ID", data.jobId]);
    csv += csvRow([]);
    csv += csvRow(["Section", "Type", "GLCode", "GLAccountName", "Description", "Amount", "Notes"]);

    for (const item of data.lineItems) {
      csv += csvRow([item.section, item.type, item.glCode, item.glAccountName, item.description, item.amount.toFixed(2), item.notes]);
    }

    csv += csvRow([]);
    csv += csvRow(["Contract Value (incl. approved COs)", data.totals.contractValue.toFixed(2)]);
    csv += csvRow(["Projected Final Cost", data.totals.projectedFinalCost.toFixed(2)]);
    csv += csvRow(["Projected Gross Profit", data.totals.projectedGrossProfit.toFixed(2)]);
    csv += csvRow(["Billed To Date", data.totals.billedAmount.toFixed(2)]);

    return {
      contentType: "text/csv; charset=utf-8",
      filename: `${data.jobTitle.replace(/[^a-z0-9]+/gi, "-")}-accounting-export.csv`,
      body: csv,
    };
  }
}
