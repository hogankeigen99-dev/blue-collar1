import { scopedPrisma } from "@/lib/tenant";

/** Next pay-application number for a job — "INV-{jobNumber}-{seq}", derived
 * from how many invoices this job already has rather than typed by hand, the
 * same "generate, don't type" pattern as lib/job-number.ts and
 * lib/opportunity-number.ts. Takes an already-company-scoped client and a
 * job already verified to belong to this company. */
export async function generateNextInvoiceNumber(prisma: ReturnType<typeof scopedPrisma>, jobId: string, jobNumber: string): Promise<string> {
  const count = await prisma.invoice.count({ where: { jobId } });
  return `INV-${jobNumber}-${String(count + 1).padStart(2, "0")}`;
}
