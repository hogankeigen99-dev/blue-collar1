import { scopedPrisma } from "@/lib/tenant";

export type SearchResultType = "job" | "opportunity" | "customer" | "worker" | "costCode" | "changeOrder" | "materialRequest" | "equipment" | "document" | "vendor" | "bidPackage";

export type SearchResult = {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

const TYPE_LABEL: Record<SearchResultType, string> = {
  job: "Project",
  opportunity: "Opportunity",
  customer: "Customer",
  worker: "Worker",
  costCode: "Cost code",
  changeOrder: "Change order",
  materialRequest: "Material request",
  equipment: "Equipment",
  document: "Document",
  vendor: "Vendor",
  bidPackage: "Bid package",
};
export { TYPE_LABEL as SEARCH_TYPE_LABEL };

const PER_TYPE_LIMIT = 8;
const MIN_QUERY_LENGTH = 2;

/**
 * Company-wide search across every record type someone might actually be
 * looking for by name/number, without needing to know which module holds
 * it. Deliberately simple — case-insensitive `contains` queries against
 * existing tables, no external search infrastructure, fast at this app's
 * actual data volume.
 */
export async function globalSearch(companyId: string, query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY_LENGTH) return [];
  const prisma = scopedPrisma(companyId);
  const ci = { contains: q, mode: "insensitive" as const };

  const [jobs, opportunities, customers, workers, costCodes, changeOrders, materialRequests, equipment, documents, vendors, bidPackages] = await Promise.all([
    prisma.job.findMany({
      where: { OR: [{ title: ci }, { jobNumber: ci }] },
      take: PER_TYPE_LIMIT,
      select: { id: true, title: true, jobNumber: true },
    }),
    prisma.opportunity.findMany({
      where: { OR: [{ title: ci }, { bidNumber: ci }] },
      take: PER_TYPE_LIMIT,
      select: { id: true, title: true, bidNumber: true },
    }),
    prisma.customer.findMany({ where: { name: ci }, take: PER_TYPE_LIMIT, select: { id: true, name: true, address: true } }),
    prisma.worker.findMany({ where: { name: ci }, take: PER_TYPE_LIMIT, select: { id: true, name: true, role: true } }),
    prisma.costCode.findMany({
      where: { OR: [{ code: ci }, { description: ci }] },
      take: PER_TYPE_LIMIT,
      select: { id: true, code: true, description: true },
    }),
    prisma.changeOrder.findMany({
      where: { title: ci },
      take: PER_TYPE_LIMIT,
      select: { id: true, title: true, jobId: true, job: { select: { title: true } } },
    }),
    prisma.materialRequest.findMany({
      where: { description: ci },
      take: PER_TYPE_LIMIT,
      select: { id: true, description: true, jobId: true, job: { select: { title: true } } },
    }),
    prisma.equipment.findMany({ where: { name: ci }, take: PER_TYPE_LIMIT, select: { id: true, name: true, type: true } }),
    prisma.document.findMany({
      where: { title: ci },
      take: PER_TYPE_LIMIT,
      select: { id: true, title: true, jobId: true, job: { select: { title: true } } },
    }),
    prisma.vendor.findMany({
      where: { OR: [{ name: ci }, { trade: ci }] },
      take: PER_TYPE_LIMIT,
      select: { id: true, name: true, trade: true },
    }),
    prisma.bidPackage.findMany({
      where: { title: ci },
      take: PER_TYPE_LIMIT,
      select: { id: true, title: true, jobId: true, job: { select: { title: true } } },
    }),
  ]);

  const results: SearchResult[] = [
    ...jobs.map((j) => ({ type: "job" as const, id: j.id, title: j.title, subtitle: j.jobNumber, href: `/jobs/${j.id}` })),
    ...opportunities.map((o) => ({ type: "opportunity" as const, id: o.id, title: o.title, subtitle: o.bidNumber, href: `/opportunities/${o.id}` })),
    ...customers.map((c) => ({ type: "customer" as const, id: c.id, title: c.name, subtitle: c.address ?? "", href: `/customers` })),
    ...workers.map((w) => ({ type: "worker" as const, id: w.id, title: w.name, subtitle: w.role ?? "", href: `/workers/${w.id}` })),
    ...costCodes.map((c) => ({ type: "costCode" as const, id: c.id, title: `${c.code} — ${c.description}`, subtitle: "", href: `/cost-codes` })),
    ...changeOrders.map((c) => ({ type: "changeOrder" as const, id: c.id, title: c.title, subtitle: c.job.title, href: `/jobs/${c.jobId}/change-orders` })),
    ...materialRequests.map((m) => ({ type: "materialRequest" as const, id: m.id, title: m.description, subtitle: m.job.title, href: `/jobs/${m.jobId}/materials` })),
    ...equipment.map((e) => ({ type: "equipment" as const, id: e.id, title: e.name, subtitle: e.type ?? "", href: `/equipment` })),
    ...documents.map((d) => ({ type: "document" as const, id: d.id, title: d.title, subtitle: d.job.title, href: `/jobs/${d.jobId}/documents` })),
    ...vendors.map((v) => ({ type: "vendor" as const, id: v.id, title: v.name, subtitle: v.trade ?? "", href: `/vendors/${v.id}` })),
    ...bidPackages.map((p) => ({ type: "bidPackage" as const, id: p.id, title: p.title, subtitle: p.job.title, href: `/jobs/${p.jobId}/bid-packages/${p.id}` })),
  ];

  return results;
}
