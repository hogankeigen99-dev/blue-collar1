import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { getBidPackage } from "@/lib/subbids";
import { inviteSubBid, updateSubBid, selectSubBidWinner } from "@/lib/subbid-actions";
import { requireSession } from "@/lib/session";
import { canManageEstimates } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const EDITABLE_STATUSES = ["INVITED", "RECEIVED", "DECLINED"] as const;

const STATUS_CLASSES: Record<string, string> = {
  INVITED: "bg-slate-100 text-slate-600",
  RECEIVED: "bg-blue-100 text-blue-700",
  SELECTED: "bg-green-100 text-green-700",
  REJECTED: "bg-slate-100 text-slate-400",
  DECLINED: "bg-slate-100 text-slate-400",
};

function toDateInputValue(date: Date | null): string {
  return date ? new Date(date).toISOString().slice(0, 10) : "";
}

export default async function BidPackageDetailPage({
  params,
}: {
  params: Promise<{ id: string; bidPackageId: string }>;
}) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const { id, bidPackageId } = await params;

  const [job, pkg, vendors] = await Promise.all([
    prisma.job.findFirst({ where: { id } }),
    getBidPackage(session.companyId, id, bidPackageId),
    prisma.vendor.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!job || !pkg) notFound();

  const canManage = canManageEstimates(session.role);
  const isOpen = pkg.status === "OPEN";

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/jobs/${job.id}/bid-packages`} className="text-sm text-blue-600 hover:underline">
          &larr; Bid packages
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-2 mt-1">
          <h1 className="text-2xl font-semibold">{pkg.title}</h1>
          <span className={`text-xs px-2 py-1 rounded-full ${pkg.status === "AWARDED" ? "bg-green-100 text-green-700" : pkg.status === "CANCELLED" ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-700"}`}>
            {pkg.status}
          </span>
        </div>
        {pkg.scope && <p className="text-slate-600 text-sm mt-2 whitespace-pre-wrap">{pkg.scope}</p>}
        {pkg.dueDate && <p className="text-slate-400 text-xs mt-1">Bids due {formatDate(pkg.dueDate)}</p>}
      </div>

      {pkg.status === "AWARDED" && pkg.awardedSubcontractId && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm">
          Awarded — a Subcontract was created automatically from the winning bid, committed cost and vendor carried
          over with no re-entry.{" "}
          <Link href={`/jobs/${job.id}/subcontracts`} className="text-green-700 font-medium hover:underline">
            View subcontract &rarr;
          </Link>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Bids ({pkg.bids.length})</h2>
        {pkg.bids.length === 0 ? (
          <p className="text-slate-500 text-sm bg-white border rounded-lg p-4">No bids invited yet.</p>
        ) : (
          <div className="space-y-3">
            {pkg.bids.map((b) => (
              <div key={b.id} className="bg-white border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="font-medium text-sm">
                      {b.vendorId ? (
                        <Link href={`/vendors/${b.vendorId}`} className="hover:underline">
                          {b.vendorName}
                        </Link>
                      ) : (
                        b.vendorName
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {b.amount !== null ? formatMoney(b.amount) : "No quote yet"}
                      {b.receivedDate ? ` · received ${formatDate(b.receivedDate)}` : ""}
                    </div>
                    {b.scopeNotes && <div className="text-xs text-slate-600 mt-1">Scope: {b.scopeNotes}</div>}
                    {b.exclusions && <div className="text-xs text-red-600 mt-1">Excludes: {b.exclusions}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${STATUS_CLASSES[b.status]}`}>{b.status}</span>
                    {canManage && isOpen && b.status === "RECEIVED" && (
                      <form action={selectSubBidWinner}>
                        <input type="hidden" name="id" value={b.id} />
                        <input type="hidden" name="jobId" value={job.id} />
                        <input type="hidden" name="bidPackageId" value={pkg.id} />
                        <button
                          type="submit"
                          className="bg-green-600 text-white text-xs px-3 py-1.5 rounded-md hover:bg-green-700"
                        >
                          Select as winner
                        </button>
                      </form>
                    )}
                  </div>
                </div>

                {canManage && isOpen && (b.status === "INVITED" || b.status === "RECEIVED") && (
                  <form action={updateSubBid} className="flex flex-wrap items-end gap-2 pt-2 border-t text-xs">
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="bidPackageId" value={pkg.id} />
                    <div>
                      <label className="block mb-1">Status</label>
                      <select name="status" defaultValue={b.status} className="border rounded-md px-2 py-1">
                        {EDITABLE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block mb-1">Quote ($)</label>
                      <input name="amount" type="number" step="any" min="0" defaultValue={b.amount ?? ""} className="border rounded-md px-2 py-1 w-28" />
                    </div>
                    <div>
                      <label className="block mb-1">Received</label>
                      <input name="receivedDate" type="date" defaultValue={toDateInputValue(b.receivedDate)} className="border rounded-md px-2 py-1" />
                    </div>
                    <div className="flex-1 min-w-[10rem]">
                      <label className="block mb-1">Scope notes</label>
                      <input name="scopeNotes" defaultValue={b.scopeNotes ?? ""} className="border rounded-md px-2 py-1 w-full" placeholder="What this bid actually covers" />
                    </div>
                    <div className="flex-1 min-w-[10rem]">
                      <label className="block mb-1">Exclusions</label>
                      <input name="exclusions" defaultValue={b.exclusions ?? ""} className="border rounded-md px-2 py-1 w-full" placeholder="What's explicitly not included" />
                    </div>
                    <button type="submit" className="bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-700">
                      Save
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {canManage && isOpen && (
        <div className="bg-white border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-medium">Invite a sub to quote</h2>
          <form action={inviteSubBid} className="grid grid-cols-2 gap-4">
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="bidPackageId" value={pkg.id} />
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
            <div className="col-span-2">
              <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
                Invite
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
