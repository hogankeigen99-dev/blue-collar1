import { getValidSageAccessToken } from "@/lib/accounting/sage-tokens";
import type { AccountingConnector, AccountingExportData, AccountingExportResult } from "@/lib/accounting/types";

const OBJECTS_BASE_URL = "https://api.intacct.com/ia/api/v1/objects";

/**
 * Pushes a job's GL-coded cost/revenue lines into Sage Intacct as a
 * journal entry, via the real, OAuth-authenticated REST API — not a stub.
 *
 * CONFIDENCE NOTE: the OAuth2 connection (sage-oauth.ts) is verified
 * against Sage's own documentation. This part — the exact object endpoint
 * (`general-ledger/journal-entry`) and its required field names below —
 * is this module's best-supported reading of Sage's REST object-endpoint
 * pattern (`/objects/{module}/{object}`, confirmed for other objects like
 * `general-ledger/account` and `accounts-receivable/customer`), but
 * developer.sage.com's OpenAPI spec itself was unreachable from this
 * environment's network to confirm the exact journal-entry schema. Treat
 * a rejected payload here as "the schema needs adjusting to match your
 * Sage Intacct sandbox," not as a bug in the OAuth/connection layer —
 * and validate this against a live sandbox before relying on it for real
 * postings.
 */
export class SageIntacctConnector implements AccountingConnector {
  readonly id = "SAGE";
  readonly label = "Sage Intacct";

  constructor(private readonly companyId: string) {}

  async export(data: AccountingExportData): Promise<AccountingExportResult> {
    const accessToken = await getValidSageAccessToken(this.companyId);
    if (!accessToken) {
      throw new Error("This company hasn't connected Sage Intacct yet (Settings → Integrations).");
    }

    const lines = data.lineItems
      .filter((item) => item.glCode) // only GL-mapped lines are postable
      .map((item) => ({
        glAccountNo: item.glCode,
        description: `${data.jobTitle} — ${item.description}`,
        trAmount: item.type === "COST" ? item.amount : -item.amount, // debit cost, credit revenue
        memo: item.notes,
      }));

    const payload = {
      description: `CrewSync export — ${data.jobTitle}`,
      journalId: "GJ", // general journal — verify this matches the company's journal setup in Sage
      lines,
    };

    const res = await fetch(`${OBJECTS_BASE_URL}/general-ledger/journal-entry`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Sage Intacct rejected the journal entry (HTTP ${res.status}): ${body}`);
    }

    const result = (await res.json()) as { id?: string; key?: string };
    const recordId = result.id ?? result.key ?? "(unknown)";

    return {
      contentType: "application/json",
      filename: `${data.jobTitle.replace(/[^a-z0-9]+/gi, "-")}-sage-journal-entry.json`,
      body: JSON.stringify({ sageJournalEntryId: recordId, linesPosted: lines.length }, null, 2),
    };
  }
}
