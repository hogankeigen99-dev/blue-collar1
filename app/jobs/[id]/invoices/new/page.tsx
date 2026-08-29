import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { createInvoice } from "@/lib/invoice-actions";
import { requirePageRole } from "@/lib/session";

function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function NewInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePageRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;
  const job = await prisma.job.findFirst({ where: { id } });
  if (!job) notFound();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href={`/jobs/${job.id}/invoices`} className="text-sm text-blue-600 hover:underline">
          &larr; Invoices
        </Link>
        <h1 className="text-2xl font-semibold mt-1">New invoice</h1>
      </div>

      <form action={createInvoice} className="space-y-4 bg-white border rounded-lg p-6">
        <input type="hidden" name="jobId" value={job.id} />

        <div>
          <label className="block text-sm font-medium mb-1">Invoice number *</label>
          <input name="invoiceNumber" required className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Amount *</label>
            <input name="amount" type="number" step="any" min="0" required className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Date *</label>
            <input name="date" type="date" defaultValue={todayLocal()} required className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Notes</label>
          <textarea name="notes" rows={2} className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>

        <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
          Create invoice
        </button>
      </form>
    </div>
  );
}
