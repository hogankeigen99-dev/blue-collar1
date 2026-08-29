import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { createSubcontract } from "@/lib/subcontract-actions";
import { requirePageRole } from "@/lib/session";

export default async function NewSubcontractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePageRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;
  const [job, vendors] = await Promise.all([
    prisma.job.findFirst({ where: { id } }),
    prisma.vendor.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!job) notFound();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href={`/jobs/${job.id}/subcontracts`} className="text-sm text-blue-600 hover:underline">
          &larr; Subcontracts
        </Link>
        <h1 className="text-2xl font-semibold mt-1">New subcontract</h1>
      </div>

      <form action={createSubcontract} className="space-y-4 bg-white border rounded-lg p-6">
        <input type="hidden" name="jobId" value={job.id} />

        <div>
          <label className="block text-sm font-medium mb-1">Vendor</label>
          <select name="vendorId" className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="">— New vendor (name below) —</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.trade ? ` (${v.trade})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">New vendor name</label>
          <input name="newVendorName" className="w-full border rounded-md px-3 py-2 text-sm" placeholder="Only if not selected above" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Scope</label>
          <input name="description" className="w-full border rounded-md px-3 py-2 text-sm" placeholder="e.g. Rebar placement, Phase 2 slab" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Committed amount ($) *</label>
            <input name="committedAmount" type="number" step="any" min="0" required className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Retainage (%)</label>
            <input name="retainagePct" type="number" step="any" min="0" max="100" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Agreement status</label>
            <select name="agreementStatus" defaultValue="DRAFT" className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="DRAFT">Draft — not yet signed</option>
              <option value="EXECUTED">Executed — signed and in effect</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">COI expiration date</label>
            <input name="coiExpirationDate" type="date" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
        </div>

        <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
          Add subcontract
        </button>
      </form>
    </div>
  );
}
