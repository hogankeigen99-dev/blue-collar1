"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { buildAccountingExportData, getAccountingConnector } from "@/lib/accounting";

/**
 * Pushes a job's accounting data to whichever connector this company has
 * connected (Sage Intacct once /settings/integrations is connected; falls
 * back to CsvAccountingConnector otherwise, which — pushed via a POST
 * action instead of downloaded — just returns the formatted text rather
 * than writing anywhere). A real external write, so this is POST-only
 * (a form submission the PM/ADMIN explicitly clicks), never a GET link —
 * unlike the CSV download, this has a side effect on Sage's side and must
 * not be safe/idempotent-by-accident (link prefetch, browser back, a
 * crawler following the href).
 */
export async function pushJobToAccountingConnector(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) throw new Error("Job is required");

  const data = await buildAccountingExportData(session.companyId, jobId);
  if (!data) throw new Error("Job not found");

  const connector = await getAccountingConnector(session.companyId);
  const result = await connector.export(data);

  await logAudit(session, {
    action: "accounting_export.pushed",
    entityType: "Job",
    entityId: jobId,
    jobId,
    detail: `via ${connector.label}${connector.id === "SAGE" ? "" : " (no external system connected — nothing was actually posted anywhere)"}`,
  });

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}?accountingPush=${encodeURIComponent(connector.label)}&pushResult=${encodeURIComponent(result.filename)}`);
}
