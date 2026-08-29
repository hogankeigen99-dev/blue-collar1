import { scopedPrisma } from "@/lib/tenant";
import { getJobCosting } from "@/lib/job-costing";
import { getBillingReadiness } from "@/lib/billing";
import { getAnthropicClient, firstTextBlock, AI_MODEL } from "@/lib/ai/client";
import { COST_CATEGORY_LABEL, PROJECT_STAGE_LABEL } from "@/lib/format";

const SYSTEM_PROMPT =
  "You are a construction project manager's assistant. Answer the question using ONLY the job " +
  "data provided below — do not invent numbers, dates, or facts not present in it. If the data " +
  "doesn't contain what's needed to answer, say so plainly instead of guessing. Be concise and " +
  "specific (cite actual numbers/dates from the data). Plain text, no markdown headers.";

async function buildJobContext(companyId: string, jobId: string): Promise<{ jobTitle: string; context: string }> {
  const prisma = scopedPrisma(companyId);
  const job = await prisma.job.findFirst({
    where: { id: jobId },
    include: { customer: true, pm: true, foreman: true },
  });
  if (!job) throw new Error("Job not found");

  const [costing, billing, recentReports, changeOrders, materialRequests, subcontractorCosts, invoices] = await Promise.all([
    getJobCosting(companyId, jobId),
    getBillingReadiness(companyId, jobId),
    prisma.dailyReport.findMany({ where: { jobId }, orderBy: { date: "desc" }, take: 5 }),
    prisma.changeOrder.findMany({ where: { jobId }, orderBy: { createdAt: "desc" } }),
    prisma.materialRequest.findMany({ where: { jobId } }),
    prisma.subcontract.findMany({ where: { jobId }, include: { vendor: true } }),
    prisma.invoice.findMany({ where: { jobId } }),
  ]);

  const lines: string[] = [];
  lines.push(`Job: ${job.title}`);
  lines.push(`Customer: ${job.customer?.name ?? "none"}`);
  lines.push(`Status: ${job.status}, Stage: ${PROJECT_STAGE_LABEL[job.stage]}`);
  lines.push(`PM: ${job.pm?.name ?? "unassigned"}, Foreman: ${job.foreman?.name ?? "unassigned"}`);
  lines.push(`Target start: ${job.targetStartDate?.toISOString().slice(0, 10) ?? "not set"}, Target finish: ${job.targetEndDate?.toISOString().slice(0, 10) ?? "not set"}`);
  lines.push("");
  lines.push(`Contract value (incl. approved COs): ${costing.contractValue}`);
  lines.push(`Billed to date: ${costing.billedAmount}`);
  lines.push(`Projected final cost: ${costing.projectedFinalCost}`);
  lines.push(`Projected gross profit: ${costing.projectedGrossProfit}`);
  lines.push(`Projected margin: ${costing.projectedMarginPct !== null ? `${(costing.projectedMarginPct * 100).toFixed(1)}%` : "n/a"}`);
  lines.push("Cost by category (estimated / committed / actual / projected):");
  for (const c of costing.categories) {
    lines.push(`  ${COST_CATEGORY_LABEL[c.category]}: ${c.estimated} / ${c.committed} / ${c.actual} / ${c.projected}`);
  }
  lines.push("");
  lines.push(`Billing readiness: ${billing.ready ? "ready to invoice" : "NOT ready"}`);
  for (const check of billing.checks) {
    lines.push(`  ${check.ok ? "OK" : "NOT OK"} — ${check.label}: ${check.detail}`);
  }
  lines.push("");
  lines.push(`Change orders (${changeOrders.length}):`);
  for (const co of changeOrders) {
    lines.push(`  "${co.title}" — status ${co.status}, revenue ${co.revenueAmount ?? 0}, cost ${co.costAmount ?? 0}`);
  }
  lines.push("");
  lines.push(`Material requests (${materialRequests.length}):`);
  for (const m of materialRequests) {
    lines.push(`  "${m.description}" — status ${m.status}, qty ${m.quantity} ${m.unit}, cost ${m.totalCost ?? "unset"}${m.expectedDeliveryDate ? `, expected ${m.expectedDeliveryDate.toISOString().slice(0, 10)}` : ""}`);
  }
  lines.push("");
  lines.push(`Subcontracts (${subcontractorCosts.length}):`);
  for (const s of subcontractorCosts) {
    lines.push(
      `  ${s.vendor?.name ?? "Unnamed vendor"} — agreement ${s.agreementStatus}, billing status ${s.status}, committed ${s.committedAmount}, actual ${s.actualAmount}`
    );
  }
  lines.push("");
  lines.push(`Invoices (${invoices.length}):`);
  for (const inv of invoices) {
    lines.push(`  ${inv.invoiceNumber} — ${inv.amount}, status ${inv.status}, date ${inv.date.toISOString().slice(0, 10)}`);
  }
  lines.push("");
  lines.push(`Most recent daily reports (newest first, up to 5):`);
  for (const r of recentReports) {
    const flags = [
      r.blockers && `blocker: ${r.blockers}`,
      r.safetyIssue && `safety: ${r.safetyIssue}`,
      r.hasChangeCondition && `change condition: ${r.changeConditionNotes ?? "(flagged)"}`,
    ].filter(Boolean);
    lines.push(`  ${r.date.toISOString().slice(0, 10)}: ${r.workCompleted ?? "no work notes"}${flags.length ? ` [${flags.join("; ")}]` : ""}`);
  }

  return { jobTitle: job.title, context: lines.join("\n") };
}

export async function askJobQuestion(companyId: string, jobId: string, question: string): Promise<string> {
  const { context } = await buildJobContext(companyId, jobId);

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `${context}\n\nQuestion: ${question}` }],
  });

  return firstTextBlock(response.content);
}
