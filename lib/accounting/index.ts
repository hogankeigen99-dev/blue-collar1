import { CsvAccountingConnector } from "@/lib/accounting/csv-connector";
import { SageIntacctConnector } from "@/lib/accounting/sage-connector";
import { getSageConnection } from "@/lib/accounting/sage-tokens";
import type { AccountingConnector } from "@/lib/accounting/types";

export type { AccountingConnector, AccountingExportData, AccountingLineItem, AccountingExportResult } from "@/lib/accounting/types";
export { buildAccountingExportData } from "@/lib/accounting/build-export-data";

/**
 * Picks the connector for one company: Sage Intacct if that company has
 * completed the OAuth connection (Settings → Integrations → Connect),
 * otherwise the CSV fallback everyone gets by default. QuickBooks/
 * Foundation/Autodesk/BuildingConnected each need their own real API
 * access this app doesn't have yet (see README's integrations section) —
 * this factory is where a connector for one of those slots in once built.
 */
export async function getAccountingConnector(companyId: string): Promise<AccountingConnector> {
  const sageConnection = await getSageConnection(companyId);
  if (sageConnection) {
    return new SageIntacctConnector(companyId);
  }
  return new CsvAccountingConnector();
}
