import { scopedPrisma } from "@/lib/tenant";

const COI_WARNING_DAYS = 30;

/** Finds-or-creates a Vendor by name, for the inline "pick an existing
 * vendor, or just type a new one" pattern used on the material request,
 * subcontract, and Award forms — mirrors how a new Customer gets created
 * inline at Award time. Takes an already-company-scoped client; Vendor is a
 * tenant model, so both the lookup and the create are scoped automatically.
 * Returns undefined if neither an id nor a name was given. */
export async function resolveOrCreateVendorId(
  prisma: ReturnType<typeof scopedPrisma>,
  companyId: string,
  vendorId: string | undefined,
  newVendorName: string | undefined
): Promise<string | undefined> {
  if (vendorId) return vendorId;
  if (!newVendorName) return undefined;
  const existing = await prisma.vendor.findFirst({ where: { name: newVendorName } });
  if (existing) return existing.id;
  const created = await prisma.vendor.create({ data: { companyId, name: newVendorName } });
  return created.id;
}

export type VendorRow = {
  id: string;
  name: string;
  trade: string | null;
  contactInfo: string | null;
  jobCount: number;
  materialCommitted: number;
  subcontractCommitted: number;
  subcontractActual: number;
  totalCommitted: number;
  coiIssue: "expired" | "expiring" | null;
};

/** Company-wide vendor directory with spend aggregated live from
 * MaterialRequest/Subcontract — nothing about a vendor's spend or job
 * history is stored on the Vendor row itself, same "compute, don't store"
 * pattern as job costing. */
export async function getVendors(companyId: string): Promise<VendorRow[]> {
  const prisma = scopedPrisma(companyId);
  const vendors = await prisma.vendor.findMany({
    orderBy: { name: "asc" },
    include: {
      materialRequests: { select: { jobId: true, totalCost: true } },
      subcontracts: {
        select: { jobId: true, committedAmount: true, actualAmount: true, agreementStatus: true, coiExpirationDate: true },
      },
    },
  });

  const now = Date.now();
  const warningCutoff = now + COI_WARNING_DAYS * 86_400_000;

  return vendors.map((v) => {
    const jobIds = new Set([...v.materialRequests.map((m) => m.jobId), ...v.subcontracts.map((s) => s.jobId)]);
    const materialCommitted = v.materialRequests.reduce((s, m) => s + (m.totalCost ?? 0), 0);
    const subcontractCommitted = v.subcontracts.reduce((s, c) => s + c.committedAmount, 0);
    const subcontractActual = v.subcontracts.reduce((s, c) => s + c.actualAmount, 0);

    let coiIssue: VendorRow["coiIssue"] = null;
    for (const c of v.subcontracts) {
      if (c.agreementStatus !== "EXECUTED" || !c.coiExpirationDate) continue;
      const exp = c.coiExpirationDate.getTime();
      if (exp < now) coiIssue = "expired";
      else if (exp < warningCutoff && coiIssue !== "expired") coiIssue = "expiring";
    }

    return {
      id: v.id,
      name: v.name,
      trade: v.trade,
      contactInfo: v.contactInfo,
      jobCount: jobIds.size,
      materialCommitted,
      subcontractCommitted,
      subcontractActual,
      totalCommitted: materialCommitted + subcontractCommitted,
      coiIssue,
    };
  });
}

export type VendorDetail = {
  id: string;
  name: string;
  trade: string | null;
  contactInfo: string | null;
  materialRequests: { id: string; jobId: string; jobTitle: string; description: string; status: string; totalCost: number | null }[];
  subcontracts: {
    id: string;
    jobId: string;
    jobTitle: string;
    description: string | null;
    committedAmount: number;
    actualAmount: number;
    status: string;
    agreementStatus: string;
    coiExpirationDate: Date | null;
  }[];
};

export async function getVendor(companyId: string, id: string): Promise<VendorDetail | null> {
  const prisma = scopedPrisma(companyId);
  const vendor = await prisma.vendor.findFirst({
    where: { id },
    include: {
      materialRequests: { include: { job: true }, orderBy: { createdAt: "desc" } },
      subcontracts: { include: { job: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!vendor) return null;

  return {
    id: vendor.id,
    name: vendor.name,
    trade: vendor.trade,
    contactInfo: vendor.contactInfo,
    materialRequests: vendor.materialRequests.map((m) => ({
      id: m.id,
      jobId: m.jobId,
      jobTitle: m.job.title,
      description: m.description,
      status: m.status,
      totalCost: m.totalCost,
    })),
    subcontracts: vendor.subcontracts.map((c) => ({
      id: c.id,
      jobId: c.jobId,
      jobTitle: c.job.title,
      description: c.description,
      committedAmount: c.committedAmount,
      actualAmount: c.actualAmount,
      status: c.status,
      agreementStatus: c.agreementStatus,
      coiExpirationDate: c.coiExpirationDate,
    })),
  };
}
