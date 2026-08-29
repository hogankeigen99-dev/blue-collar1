import { CsvAccountingConnector } from "@/lib/accounting/csv-connector";
import type { AccountingConnector } from "@/lib/accounting/types";

export type { AccountingConnector, AccountingExportData, AccountingLineItem, AccountingExportResult } from "@/lib/accounting/types";
export { buildAccountingExportData } from "@/lib/accounting/build-export-data";

/**
 * CSV is the only connector actually implemented — QuickBooks/Sage/
 * Foundation each need real API access this app doesn't have yet (see
 * README's integrations section). This factory exists so that switching
 * the active connector, once one of those is built, is a one-line change
 * here rather than a rewrite of the export route.
 */
export function getAccountingConnector(): AccountingConnector {
  return new CsvAccountingConnector();
}
