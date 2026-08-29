/**
 * The shape every accounting connector consumes — one job's costing,
 * change orders, and invoices, GL-coded where a mapping exists. Assembled
 * once (build-export-data.ts) and handed to whichever connector is active,
 * so adding a new connector never means re-deriving this data differently.
 */
export type AccountingLineItem = {
  section: "Cost Category" | "Change Order" | "Invoice";
  type: "COST" | "REVENUE";
  glCode: string;
  glAccountName: string;
  description: string;
  amount: number;
  notes: string;
};

export type AccountingExportData = {
  jobId: string;
  jobTitle: string;
  lineItems: AccountingLineItem[];
  totals: {
    contractValue: number;
    projectedFinalCost: number;
    projectedGrossProfit: number;
    billedAmount: number;
  };
};

export type AccountingExportResult = {
  contentType: string;
  filename: string;
  body: string;
};

/**
 * One implementation per accounting system. CsvConnector (csv-connector.ts)
 * is the only one that actually talks to anything today — it hands back a
 * file for the user to import by hand. A future QuickBooks/Sage/Foundation
 * connector implements the same interface but POSTs AccountingExportData
 * straight to that provider's API instead of formatting a file; nothing
 * above this interface (the route, the data assembly) needs to change
 * when that's built, only lib/accounting/index.ts's provider selection.
 */
export interface AccountingConnector {
  readonly id: string;
  readonly label: string;
  export(data: AccountingExportData): Promise<AccountingExportResult>;
}
