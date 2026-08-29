"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { generateNextBidNumber } from "@/lib/opportunity-number";
import { logAudit } from "@/lib/audit";

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function num(formData: FormData, key: string): number | undefined {
  const v = str(formData, key);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Creates a new Opportunity — the front door, before there's a real
 * project. No cost codes yet; those get added on the bid workspace
 * (addOpportunityCostCode below), the same "estimate lines separate from
 * the record's core fields" shape the Award flow already uses for Job. */
export async function createOpportunity(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);

  const title = str(formData, "title");
  if (!title) throw new Error("Opportunity title is required");

  // Unlike Award (which creates a Customer inline from a typed name), an
  // opportunity is allowed to have neither a customerId nor a prospectName
  // resolved to a real record yet — a prospect name is genuinely
  // provisional here; it only becomes a real Customer at Award time, if
  // and when this is won.
  const customerId = str(formData, "customerId");
  const prospectName = str(formData, "prospectName");

  const bidNumber = await generateNextBidNumber(prisma);

  const opportunity = await prisma.opportunity.create({
    data: {
      companyId: session.companyId,
      bidNumber,
      title,
      customerId,
      prospectName,
      source: str(formData, "source"),
      projectType: str(formData, "projectType"),
      estimatedValue: num(formData, "estimatedValue"),
      probability: num(formData, "probability"),
      bidDueDate: str(formData, "bidDueDate") ? new Date(str(formData, "bidDueDate")!) : undefined,
      assignedToUserId: str(formData, "assignedToUserId"),
    },
  });

  await logAudit(session, {
    action: "opportunity.created",
    entityType: "Opportunity",
    entityId: opportunity.id,
    detail: `${bidNumber} — ${title}`,
  });

  revalidatePath("/opportunities");
  redirect(`/opportunities/${opportunity.id}`);
}

/** Updates an opportunity's own fields (not its stage — see markLost/the
 * Award form for WON). Kept separate from creation so the bid workspace can
 * save small edits (probability, bid due date, ...) as the estimate
 * develops without re-submitting the whole record. */
export async function updateOpportunity(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const opportunityId = str(formData, "opportunityId");
  if (!opportunityId) throw new Error("Opportunity is required");

  await prisma.opportunity.findFirstOrThrow({ where: { id: opportunityId } });

  const stage = str(formData, "stage");
  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      title: str(formData, "title"),
      source: str(formData, "source"),
      projectType: str(formData, "projectType"),
      estimatedValue: num(formData, "estimatedValue"),
      probability: num(formData, "probability"),
      bidDueDate: str(formData, "bidDueDate") ? new Date(str(formData, "bidDueDate")!) : undefined,
      assignedToUserId: str(formData, "assignedToUserId"),
      // Only ever moves forward within the still-open states here — WON is
      // exclusively set by the Award flow (lib/award-actions.ts), and LOST
      // exclusively by markLost below, both of which also need to touch
      // other records (a Job, a lostReason) that a bare stage edit can't.
      stage: stage && ["OPPORTUNITY", "BIDDING", "SUBMITTED"].includes(stage) ? (stage as never) : undefined,
    },
  });

  revalidatePath(`/opportunities/${opportunityId}`);
  redirect(`/opportunities/${opportunityId}`);
}

/** Adds one cost-code estimate line to an opportunity's bid — the
 * pre-award parallel to lib/materials-actions.ts's addJobCostCode. */
export async function addOpportunityCostCode(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const opportunityId = str(formData, "opportunityId");
  const costCodeId = str(formData, "costCodeId");
  const estimatedQty = num(formData, "estimatedQty");
  const estimatedHours = num(formData, "estimatedHours");
  if (!opportunityId || !costCodeId || !estimatedQty || !estimatedHours) {
    throw new Error("Opportunity, cost code, estimated quantity, and estimated hours are required");
  }

  await prisma.opportunity.findFirstOrThrow({ where: { id: opportunityId } });
  await prisma.costCode.findFirstOrThrow({ where: { id: costCodeId } });

  await prisma.opportunityCostCode.create({
    data: { opportunityId, costCodeId, estimatedQty, estimatedHours },
  });

  revalidatePath(`/opportunities/${opportunityId}`);
  redirect(`/opportunities/${opportunityId}`);
}

/** Marks an opportunity lost (or a deliberate no-bid) — it stays queryable
 * forever for win-rate reporting; no Job is ever created for it. */
export async function markOpportunityLost(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const opportunityId = str(formData, "opportunityId");
  if (!opportunityId) throw new Error("Opportunity is required");

  const stage = str(formData, "stage") === "NO_BID" ? "NO_BID" : "LOST";
  const lostReason = str(formData, "lostReason");

  const before = await prisma.opportunity.findFirstOrThrow({ where: { id: opportunityId } });

  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: { stage, lostReason },
  });

  await logAudit(session, {
    action: "opportunity.lost",
    entityType: "Opportunity",
    entityId: opportunityId,
    detail: `${before.bidNumber} — ${stage}${lostReason ? `: ${lostReason}` : ""}`,
  });

  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${opportunityId}`);
  redirect(`/opportunities/${opportunityId}`);
}
