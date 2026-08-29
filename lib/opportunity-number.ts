import { scopedPrisma } from "@/lib/tenant";

/** Next "{year}-B{seq}" bid number for this company — the same derive-from-max
 * pattern as lib/job-number.ts, deliberately a separate sequence so a lost
 * bid never consumes or gaps a real project's jobNumber. Same concurrency
 * caveat as job numbers: fine at this app's actual pace, not safe under
 * concurrent creates in the same company+year. */
export async function generateNextBidNumber(prisma: ReturnType<typeof scopedPrisma>): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${year}-B`;
  const existing = await prisma.opportunity.findMany({
    where: { bidNumber: { startsWith: prefix } },
    select: { bidNumber: true },
  });
  const maxSeq = existing.reduce((max, o) => {
    const seq = parseInt(o.bidNumber.slice(prefix.length), 10);
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}
