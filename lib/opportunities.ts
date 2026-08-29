import { scopedPrisma } from "@/lib/tenant";
import type { OpportunityStage } from "@prisma/client";

export type OpportunityRow = {
  id: string;
  bidNumber: string;
  title: string;
  customerName: string | null;
  projectType: string | null;
  estimatedValue: number | null;
  probability: number | null;
  bidDueDate: Date | null;
  stage: OpportunityStage;
  assignedToName: string | null;
  wonJobId: string | null;
  costCodeLineCount: number;
  createdAt: Date;
};

export type OpportunityFilters = {
  stage?: OpportunityStage;
  assignedToUserId?: string;
  projectType?: string;
  /** Default true — the pipeline view's normal mode excludes decided bids;
   * pass false to include WON/LOST/NO_BID (e.g. for a full history view). */
  openOnly?: boolean;
};

const OPEN_STAGES: OpportunityStage[] = ["OPPORTUNITY", "BIDDING", "SUBMITTED"];
const DECIDED_STAGES: OpportunityStage[] = ["WON", "LOST", "NO_BID"];

export async function getOpportunityPipeline(companyId: string, filters: OpportunityFilters = {}): Promise<OpportunityRow[]> {
  const prisma = scopedPrisma(companyId);
  const openOnly = filters.openOnly ?? true;

  const rows = await prisma.opportunity.findMany({
    where: {
      stage: filters.stage ?? (openOnly ? { in: OPEN_STAGES } : undefined),
      assignedToUserId: filters.assignedToUserId,
      projectType: filters.projectType,
    },
    include: { customer: true, assignedTo: true, costCodes: true },
    orderBy: [{ bidDueDate: "asc" }, { createdAt: "desc" }],
  });

  return rows.map((o) => ({
    id: o.id,
    bidNumber: o.bidNumber,
    title: o.title,
    customerName: o.customer?.name ?? o.prospectName ?? null,
    projectType: o.projectType,
    estimatedValue: o.estimatedValue,
    probability: o.probability,
    bidDueDate: o.bidDueDate,
    stage: o.stage,
    assignedToName: o.assignedTo?.name ?? null,
    wonJobId: o.wonJobId,
    costCodeLineCount: o.costCodes.length,
    createdAt: o.createdAt,
  }));
}

export type OpportunityDetail = OpportunityRow & {
  source: string | null;
  lostReason: string | null;
  costCodes: { id: string; costCodeId: string; code: string; description: string; unit: string; estimatedQty: number; estimatedHours: number }[];
};

export async function getOpportunity(companyId: string, opportunityId: string): Promise<OpportunityDetail | null> {
  const prisma = scopedPrisma(companyId);
  const o = await prisma.opportunity.findFirst({
    where: { id: opportunityId },
    include: { customer: true, assignedTo: true, costCodes: { include: { costCode: true } } },
  });
  if (!o) return null;

  return {
    id: o.id,
    bidNumber: o.bidNumber,
    title: o.title,
    customerName: o.customer?.name ?? o.prospectName ?? null,
    projectType: o.projectType,
    estimatedValue: o.estimatedValue,
    probability: o.probability,
    bidDueDate: o.bidDueDate,
    stage: o.stage,
    assignedToName: o.assignedTo?.name ?? null,
    wonJobId: o.wonJobId,
    costCodeLineCount: o.costCodes.length,
    createdAt: o.createdAt,
    source: o.source,
    lostReason: o.lostReason,
    costCodes: o.costCodes.map((cc) => ({
      id: cc.id,
      costCodeId: cc.costCodeId,
      code: cc.costCode.code,
      description: cc.costCode.description,
      unit: cc.costCode.unit,
      estimatedQty: cc.estimatedQty,
      estimatedHours: cc.estimatedHours,
    })),
  };
}

export type WinRateSegment = { label: string; won: number; lost: number; noBid: number; total: number; winRatePct: number | null };
export type WinRateReport = {
  openCount: number;
  openValue: number;
  wonCount: number;
  lostCount: number;
  noBidCount: number;
  overallWinRatePct: number | null; // won / (won + lost) -- no-bids never competed, excluded
  byProjectType: WinRateSegment[];
  byAssignee: WinRateSegment[];
};

function segment(label: string, rows: { stage: OpportunityStage }[]): WinRateSegment {
  const won = rows.filter((r) => r.stage === "WON").length;
  const lost = rows.filter((r) => r.stage === "LOST").length;
  const noBid = rows.filter((r) => r.stage === "NO_BID").length;
  const decided = won + lost;
  return { label, won, lost, noBid, total: rows.length, winRatePct: decided > 0 ? won / decided : null };
}

/**
 * Historical Intelligence for the bid pipeline: win rate overall, by
 * project type, and by assignee — computed from every decided Opportunity
 * a company has ever recorded, not just a rolling window. NO_BID is
 * tracked separately and excluded from the win-rate ratio itself (a bid
 * never competed for isn't a loss).
 */
export async function getWinRateReport(companyId: string): Promise<WinRateReport> {
  const prisma = scopedPrisma(companyId);
  const [openRows, decidedRows] = await Promise.all([
    prisma.opportunity.findMany({ where: { stage: { in: OPEN_STAGES } }, select: { estimatedValue: true } }),
    prisma.opportunity.findMany({
      where: { stage: { in: DECIDED_STAGES } },
      select: { stage: true, projectType: true, assignedTo: { select: { name: true } } },
    }),
  ]);

  const wonCount = decidedRows.filter((r) => r.stage === "WON").length;
  const lostCount = decidedRows.filter((r) => r.stage === "LOST").length;
  const noBidCount = decidedRows.filter((r) => r.stage === "NO_BID").length;
  const decidedCount = wonCount + lostCount;

  const byProjectTypeMap = new Map<string, { stage: OpportunityStage }[]>();
  const byAssigneeMap = new Map<string, { stage: OpportunityStage }[]>();
  for (const r of decidedRows) {
    const typeKey = r.projectType ?? "Uncategorized";
    byProjectTypeMap.set(typeKey, [...(byProjectTypeMap.get(typeKey) ?? []), r]);
    const assigneeKey = r.assignedTo?.name ?? "Unassigned";
    byAssigneeMap.set(assigneeKey, [...(byAssigneeMap.get(assigneeKey) ?? []), r]);
  }

  return {
    openCount: openRows.length,
    openValue: openRows.reduce((s, r) => s + (r.estimatedValue ?? 0), 0),
    wonCount,
    lostCount,
    noBidCount,
    overallWinRatePct: decidedCount > 0 ? wonCount / decidedCount : null,
    byProjectType: Array.from(byProjectTypeMap.entries())
      .map(([label, rows]) => segment(label, rows))
      .sort((a, b) => b.total - a.total),
    byAssignee: Array.from(byAssigneeMap.entries())
      .map(([label, rows]) => segment(label, rows))
      .sort((a, b) => b.total - a.total),
  };
}
