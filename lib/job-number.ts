import { scopedPrisma } from "@/lib/tenant";

/** Next "{year}-{seq}" project number for this company — derived from the
 * current max rather than a separate sequence table. Fine at this app's
 * actual concurrency (one project awarded at a time by one admin/PM), not
 * safe under concurrent creates in the same company+year. Takes an
 * already-company-scoped client (lib/tenant.ts) — that's what does the
 * per-company isolation here. */
export async function generateNextJobNumber(prisma: ReturnType<typeof scopedPrisma>): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${year}-`;
  const existing = await prisma.job.findMany({
    where: { jobNumber: { startsWith: prefix } },
    select: { jobNumber: true },
  });
  const maxSeq = existing.reduce((max, j) => {
    const seq = parseInt(j.jobNumber.slice(prefix.length), 10);
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}
