import { scopedPrisma } from "@/lib/tenant";

export type BidPackageRow = {
  id: string;
  title: string;
  scope: string | null;
  dueDate: Date | null;
  status: "OPEN" | "AWARDED" | "CANCELLED";
  bidCount: number;
  receivedCount: number;
  lowAmount: number | null;
  highAmount: number | null;
  awardedAmount: number | null;
};

/** BidPackage isn't a tenant model — verify the job belongs to this
 * company before listing/reading anything scoped to it. */
async function verifiedJob(prisma: ReturnType<typeof scopedPrisma>, jobId: string) {
  return prisma.job.findFirstOrThrow({ where: { id: jobId } });
}

export async function getBidPackages(companyId: string, jobId: string): Promise<BidPackageRow[]> {
  const prisma = scopedPrisma(companyId);
  await verifiedJob(prisma, jobId);

  const packages = await prisma.bidPackage.findMany({
    where: { jobId },
    include: { bids: true },
    orderBy: { createdAt: "desc" },
  });

  return packages.map((p) => {
    const amounts = p.bids.filter((b) => b.amount !== null).map((b) => b.amount!);
    const awarded = p.bids.find((b) => b.status === "SELECTED");
    return {
      id: p.id,
      title: p.title,
      scope: p.scope,
      dueDate: p.dueDate,
      status: p.status,
      bidCount: p.bids.length,
      receivedCount: amounts.length,
      lowAmount: amounts.length > 0 ? Math.min(...amounts) : null,
      highAmount: amounts.length > 0 ? Math.max(...amounts) : null,
      awardedAmount: awarded?.amount ?? null,
    };
  });
}

export type SubBidRow = {
  id: string;
  vendorId: string | null;
  vendorName: string;
  amount: number | null;
  status: "INVITED" | "RECEIVED" | "SELECTED" | "REJECTED" | "DECLINED";
  scopeNotes: string | null;
  exclusions: string | null;
  receivedDate: Date | null;
};

export type BidPackageDetail = {
  id: string;
  jobId: string;
  jobTitle: string;
  title: string;
  scope: string | null;
  dueDate: Date | null;
  status: "OPEN" | "AWARDED" | "CANCELLED";
  bids: SubBidRow[];
  awardedSubcontractId: string | null;
};

/** Bids sorted lowest-amount-first (the standard bid-leveling read order) —
 * quotes not yet received sort last, grouped after the ones that can
 * actually be compared. */
export async function getBidPackage(companyId: string, jobId: string, bidPackageId: string): Promise<BidPackageDetail | null> {
  const prisma = scopedPrisma(companyId);
  await verifiedJob(prisma, jobId);

  const pkg = await prisma.bidPackage.findFirst({
    where: { id: bidPackageId, jobId },
    include: {
      job: { select: { title: true } },
      bids: { include: { vendor: true, resultingSubcontract: { select: { id: true } } } },
    },
  });
  if (!pkg) return null;

  const bids = [...pkg.bids].sort((a, b) => {
    if (a.amount === null && b.amount === null) return 0;
    if (a.amount === null) return 1;
    if (b.amount === null) return -1;
    return a.amount - b.amount;
  });

  const awarded = pkg.bids.find((b) => b.resultingSubcontract);

  return {
    id: pkg.id,
    jobId,
    jobTitle: pkg.job.title,
    title: pkg.title,
    scope: pkg.scope,
    dueDate: pkg.dueDate,
    status: pkg.status,
    bids: bids.map((b) => ({
      id: b.id,
      vendorId: b.vendorId,
      vendorName: b.vendor?.name ?? "Unnamed vendor",
      amount: b.amount,
      status: b.status,
      scopeNotes: b.scopeNotes,
      exclusions: b.exclusions,
      receivedDate: b.receivedDate,
    })),
    awardedSubcontractId: awarded?.resultingSubcontract?.id ?? null,
  };
}
