import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { canManageJobs } from "@/lib/auth";
import { getVendor } from "@/lib/vendors";
import { updateVendor } from "@/lib/vendor-actions";
import { formatMoney, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const vendor = await getVendor(session.companyId, id);
  if (!vendor) notFound();

  const canEdit = canManageJobs(session.role);
  const totalCommitted =
    vendor.materialRequests.reduce((s, m) => s + (m.totalCost ?? 0), 0) +
    vendor.subcontracts.reduce((s, c) => s + c.committedAmount, 0);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/vendors" className="text-sm text-blue-600 hover:underline">
          &larr; Vendors
        </Link>
        <h1 className="text-2xl font-semibold mt-1">{vendor.name}</h1>
        <p className="text-slate-500 text-sm mt-1">
          {vendor.trade ?? "No trade set"}
          {vendor.contactInfo ? ` · ${vendor.contactInfo}` : ""}
        </p>
      </div>

      <div className="bg-white border rounded-lg p-4">
        <div className="text-slate-500 text-xs">Total committed across every job</div>
        <div className="text-xl font-semibold">{formatMoney(totalCommitted)}</div>
      </div>

      {canEdit && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500 hover:text-slate-700">Edit trade / contact info</summary>
          <form action={updateVendor} className="mt-2 flex flex-wrap items-end gap-3 bg-white border rounded-lg p-4">
            <input type="hidden" name="id" value={vendor.id} />
            <div>
              <label className="block text-xs font-medium mb-1">Trade</label>
              <input name="trade" defaultValue={vendor.trade ?? ""} className="border rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Contact info</label>
              <input name="contactInfo" defaultValue={vendor.contactInfo ?? ""} className="border rounded-md px-3 py-2 text-sm" />
            </div>
            <button type="submit" className="bg-slate-900 text-white text-sm px-3 py-2 rounded-md hover:bg-slate-700">
              Save
            </button>
          </form>
        </details>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Subcontracts ({vendor.subcontracts.length})</h2>
        {vendor.subcontracts.length === 0 ? (
          <p className="text-slate-500 text-sm">No subcontracts with this vendor yet.</p>
        ) : (
          <div className="bg-white border rounded-lg divide-y">
            {vendor.subcontracts.map((c) => (
              <Link key={c.id} href={`/jobs/${c.jobId}/subcontracts`} className="block px-4 py-3 hover:bg-slate-50">
                <div className="font-medium text-sm">{c.jobTitle}</div>
                <div className="text-xs text-slate-500">
                  {c.description ?? "—"} · Committed {formatMoney(c.committedAmount)} · Actual {formatMoney(c.actualAmount)} ·{" "}
                  {c.agreementStatus} · {c.status}
                  {c.coiExpirationDate ? ` · COI expires ${formatDate(c.coiExpirationDate)}` : ""}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Material requests ({vendor.materialRequests.length})</h2>
        {vendor.materialRequests.length === 0 ? (
          <p className="text-slate-500 text-sm">No material requests with this vendor yet.</p>
        ) : (
          <div className="bg-white border rounded-lg divide-y">
            {vendor.materialRequests.map((m) => (
              <Link key={m.id} href={`/jobs/${m.jobId}/materials`} className="block px-4 py-3 hover:bg-slate-50">
                <div className="font-medium text-sm">{m.jobTitle}</div>
                <div className="text-xs text-slate-500">
                  {m.description} · {m.status}
                  {m.totalCost ? ` · ${formatMoney(m.totalCost)}` : ""}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
