import { scopedPrisma } from "@/lib/tenant";

type ScopedPrisma = ReturnType<typeof scopedPrisma>;

export type ContractLineRow = {
  id: string;
  description: string;
  scheduledValue: number;
  sortOrder: number;
  sourceChangeOrderId: string | null;
  billedToDate: number;
  remainingToBill: number;
};

export type ContractDetail = {
  id: string;
  jobId: string;
  type: string;
  retainagePct: number | null;
  executedDate: Date | null;
  lines: ContractLineRow[];
  scheduledTotal: number;
  billedTotal: number;
};

/**
 * Finds this job's Contract, creating a bare default (LUMP_SUM, no lines)
 * if it somehow doesn't have one yet. Every job gets a real one at Award
 * time (lib/award-actions.ts) going forward — this is just a defensive
 * fallback for the change-order automation, which must never fail to
 * record an approved CO just because its job predates this feature.
 * Caller must already have verified the job belongs to this company.
 */
export async function ensureContract(prisma: ScopedPrisma, jobId: string) {
  const existing = await prisma.contract.findFirst({ where: { jobId } });
  if (existing) return existing;
  return prisma.contract.create({ data: { jobId, type: "LUMP_SUM" } });
}

export async function getContract(companyId: string, jobId: string): Promise<ContractDetail | null> {
  const prisma = scopedPrisma(companyId);
  // Contract isn't a tenant model — verify the job belongs to this company
  // first, then look up its Contract (a child of that job).
  await prisma.job.findFirstOrThrow({ where: { id: jobId } });

  const contract = await prisma.contract.findFirst({
    where: { jobId },
    include: { lines: { orderBy: { sortOrder: "asc" }, include: { invoiceLines: true } } },
  });
  if (!contract) return null;

  const lines: ContractLineRow[] = contract.lines.map((l) => {
    const billedToDate = l.invoiceLines.reduce((s, il) => s + il.amountThisPeriod, 0);
    return {
      id: l.id,
      description: l.description,
      scheduledValue: l.scheduledValue,
      sortOrder: l.sortOrder,
      sourceChangeOrderId: l.sourceChangeOrderId,
      billedToDate,
      remainingToBill: l.scheduledValue - billedToDate,
    };
  });

  return {
    id: contract.id,
    jobId,
    type: contract.type,
    retainagePct: contract.retainagePct,
    executedDate: contract.executedDate,
    lines,
    scheduledTotal: lines.reduce((s, l) => s + l.scheduledValue, 0),
    billedTotal: lines.reduce((s, l) => s + l.billedToDate, 0),
  };
}
