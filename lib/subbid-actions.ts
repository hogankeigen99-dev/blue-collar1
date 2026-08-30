"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { resolveOrCreateVendorId } from "@/lib/vendors";

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

/** Puts a scope of work out for competing quotes — a job-scoped BidPackage,
 * before any Subcontract exists. */
export async function createBidPackage(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const jobId = str(formData, "jobId");
  const title = str(formData, "title");
  if (!jobId || !title) throw new Error("Job and title are required");

  // BidPackage is a child of Job (no companyId of its own) — verify the
  // job belongs to this company before creating against it.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });

  const dueDateRaw = str(formData, "dueDate");
  const pkg = await prisma.bidPackage.create({
    data: {
      jobId,
      title,
      scope: str(formData, "scope"),
      dueDate: dueDateRaw ? new Date(dueDateRaw) : undefined,
    },
  });

  await logAudit(session, {
    action: "bid_package.created",
    entityType: "BidPackage",
    entityId: pkg.id,
    jobId,
    detail: title,
  });

  revalidatePath(`/jobs/${jobId}/bid-packages`);
  redirect(`/jobs/${jobId}/bid-packages/${pkg.id}`);
}

/** Invites a sub to quote a package — an existing Vendor, or a new one
 * found-or-created inline (same pattern as every other "type a new vendor
 * name" form in the app). Starts as INVITED with no amount; recording the
 * actual quote is a separate step (updateSubBid) once it comes in. */
export async function inviteSubBid(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const jobId = str(formData, "jobId");
  const bidPackageId = str(formData, "bidPackageId");
  if (!jobId || !bidPackageId) throw new Error("Job and bid package are required");

  await prisma.job.findFirstOrThrow({ where: { id: jobId } });
  const pkg = await prisma.bidPackage.findFirst({ where: { id: bidPackageId, jobId } });
  if (!pkg) throw new Error("Bid package not found");
  if (pkg.status !== "OPEN") throw new Error("This bid package is already decided — reopen it before inviting more bids.");

  const vendorId = await resolveOrCreateVendorId(prisma, session.companyId, str(formData, "vendorId"), str(formData, "newVendorName"));
  if (!vendorId) throw new Error("Pick a vendor or type a new vendor name");

  await prisma.subBid.create({
    data: { bidPackageId, vendorId },
  });

  revalidatePath(`/jobs/${jobId}/bid-packages/${bidPackageId}`);
  redirect(`/jobs/${jobId}/bid-packages/${bidPackageId}`);
}

/** Records what came back from an invited sub — the actual quote amount,
 * their own scope notes, and exclusions, so bids can be compared on what
 * they actually cover instead of dollar amount alone. Also how a sub gets
 * marked as having declined to bid. */
export async function updateSubBid(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const id = str(formData, "id");
  const jobId = str(formData, "jobId");
  const bidPackageId = str(formData, "bidPackageId");
  const status = str(formData, "status");
  if (!id || !jobId || !bidPackageId || !status) {
    throw new Error("Bid, job, package, and status are required");
  }

  // SubBid isn't a tenant model, and it's two hops from Job — verify the
  // whole chain (job -> package -> bid) before updating it.
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });
  const pkg = await prisma.bidPackage.findFirst({ where: { id: bidPackageId, jobId } });
  if (!pkg) throw new Error("Bid package not found");
  const existing = await prisma.subBid.findFirst({ where: { id, bidPackageId } });
  if (!existing) throw new Error("Bid not found");

  const receivedDateRaw = str(formData, "receivedDate");
  const amount = num(formData, "amount");

  await prisma.subBid.update({
    where: { id },
    data: {
      status: status as never,
      amount,
      scopeNotes: str(formData, "scopeNotes"),
      exclusions: str(formData, "exclusions"),
      // Recording an amount for the first time is what "a quote came in"
      // means — default the received date to today if one wasn't typed,
      // same "don't make them fill in the obvious" rule as everywhere else.
      receivedDate: receivedDateRaw
        ? new Date(receivedDateRaw)
        : status === "RECEIVED" && !existing.receivedDate
          ? new Date()
          : undefined,
    },
  });

  revalidatePath(`/jobs/${jobId}/bid-packages/${bidPackageId}`);
  redirect(`/jobs/${jobId}/bid-packages/${bidPackageId}`);
}

/** The whole point: pick the winning quote and it becomes a real
 * Subcontract — vendor and committed amount carried over, not re-typed.
 * Every other still-open bid on the package is marked REJECTED (a package
 * has exactly one winner), and the package itself closes as AWARDED. */
export async function selectSubBidWinner(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const id = str(formData, "id");
  const jobId = str(formData, "jobId");
  const bidPackageId = str(formData, "bidPackageId");
  if (!id || !jobId || !bidPackageId) throw new Error("Bid, job, and package are required");

  await prisma.job.findFirstOrThrow({ where: { id: jobId } });
  const pkg = await prisma.bidPackage.findFirst({ where: { id: bidPackageId, jobId } });
  if (!pkg) throw new Error("Bid package not found");
  if (pkg.status !== "OPEN") throw new Error("This bid package has already been decided.");

  const winner = await prisma.subBid.findFirst({ where: { id, bidPackageId } });
  if (!winner) throw new Error("Bid not found");
  if (winner.status !== "RECEIVED" || winner.amount === null) {
    throw new Error("Only a received quote with an amount can be selected as the winner.");
  }

  const subcontract = await prisma.$transaction(async (tx) => {
    await tx.subBid.update({ where: { id: winner.id }, data: { status: "SELECTED" } });
    await tx.subBid.updateMany({
      where: { bidPackageId, id: { not: winner.id }, status: { in: ["INVITED", "RECEIVED"] } },
      data: { status: "REJECTED" },
    });
    await tx.bidPackage.update({ where: { id: bidPackageId }, data: { status: "AWARDED" } });
    return tx.subcontract.create({
      data: {
        jobId,
        vendorId: winner.vendorId,
        description: pkg.title,
        committedAmount: winner.amount!,
        sourceSubBidId: winner.id,
      },
    });
  });

  await logAudit(session, {
    action: "bid_package.awarded",
    entityType: "BidPackage",
    entityId: bidPackageId,
    jobId,
    detail: `${pkg.title} — awarded at ${winner.amount}, Subcontract ${subcontract.id} created`,
  });

  revalidatePath(`/jobs/${jobId}/bid-packages/${bidPackageId}`);
  revalidatePath(`/jobs/${jobId}/subcontracts`);
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}/bid-packages/${bidPackageId}`);
}
