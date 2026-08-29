import { prisma } from "@/lib/prisma";

export type BillingCheck = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type BillingReadiness = {
  ready: boolean;
  checks: BillingCheck[];
};

const OPEN_MATERIAL_STATUSES = ["REQUESTED", "APPROVED", "PO_ISSUED", "ORDERED"];

export async function getBillingReadiness(jobId: string): Promise<BillingReadiness> {
  const [job, changeOrders, dailyReports, materialRequests, subcontractorCosts] = await Promise.all([
    prisma.job.findUniqueOrThrow({ where: { id: jobId } }),
    prisma.changeOrder.findMany({ where: { jobId } }),
    prisma.dailyReport.findMany({ where: { jobId }, orderBy: { date: "desc" }, take: 1 }),
    prisma.materialRequest.findMany({ where: { jobId } }),
    prisma.subcontractorCost.findMany({ where: { jobId } }),
  ]);

  const checks: BillingCheck[] = [];

  const completionOk = job.stage === "CLOSEOUT" || job.stage === "COMPLETE";
  checks.push({
    key: "completion",
    label: "Job completion",
    ok: completionOk,
    detail: completionOk ? `Stage: ${job.stage}` : `Stage is ${job.stage}, not yet at Closeout`,
  });

  const pendingCOs = changeOrders.filter((co) => ["IDENTIFIED", "PRICED", "SUBMITTED"].includes(co.status));
  checks.push({
    key: "change_orders",
    label: "Change orders approved",
    ok: pendingCOs.length === 0,
    detail: pendingCOs.length === 0 ? "No pending change orders" : `${pendingCOs.length} change order(s) not yet approved or rejected`,
  });

  checks.push({
    key: "documents",
    label: "Required documents",
    ok: job.requiredDocsComplete,
    detail: job.requiredDocsComplete ? "Marked complete" : "Not yet marked complete",
  });

  const lastReport = dailyReports[0];
  const daysSinceReport = lastReport ? Math.floor((Date.now() - lastReport.date.getTime()) / 86_400_000) : null;
  const fieldReportsOk = job.stage === "CLOSEOUT" || job.stage === "COMPLETE"
    ? lastReport !== undefined
    : lastReport !== undefined && daysSinceReport !== null && daysSinceReport <= 7;
  checks.push({
    key: "field_reports",
    label: "Field reports",
    ok: fieldReportsOk,
    detail: lastReport
      ? `Last report ${daysSinceReport} day(s) ago`
      : "No daily reports have been submitted for this job",
  });

  checks.push({
    key: "punch_list",
    label: "Punch list",
    ok: job.punchListComplete,
    detail: job.punchListComplete ? "Marked complete" : "Not yet marked complete",
  });

  const uncostedMaterial = materialRequests.filter(
    (m) => m.status === "RECEIVED" && (m.totalCost === null || m.totalCost === undefined)
  );
  const openMaterial = materialRequests.filter((m) => OPEN_MATERIAL_STATUSES.includes(m.status));
  const uncostedSub = subcontractorCosts.filter((s) => s.status !== "COMMITTED" && s.actualAmount === 0);
  const missingCostsOk = uncostedMaterial.length === 0 && uncostedSub.length === 0 && (completionOk ? openMaterial.length === 0 : true);
  checks.push({
    key: "missing_costs",
    label: "No missing costs",
    ok: missingCostsOk,
    detail: missingCostsOk
      ? "All received/invoiced costs are recorded"
      : [
          uncostedMaterial.length > 0 ? `${uncostedMaterial.length} received material request(s) missing a cost` : null,
          uncostedSub.length > 0 ? `${uncostedSub.length} subcontractor invoice(s) missing an amount` : null,
          completionOk && openMaterial.length > 0 ? `${openMaterial.length} material request(s) still open at closeout` : null,
        ]
          .filter(Boolean)
          .join("; "),
  });

  return { ready: checks.every((c) => c.ok), checks };
}
