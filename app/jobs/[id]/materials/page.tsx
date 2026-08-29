import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { updateMaterialRequest } from "@/lib/productivity-actions";
import { requireSession } from "@/lib/session";
import { canManageEstimates } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUSES = ["REQUESTED", "APPROVED", "PO_ISSUED", "ORDERED", "RECEIVED", "REJECTED"] as const;

const STATUS_CLASSES: Record<string, string> = {
  REQUESTED: "bg-slate-100 text-slate-700",
  APPROVED: "bg-blue-100 text-blue-700",
  PO_ISSUED: "bg-purple-100 text-purple-700",
  ORDERED: "bg-amber-100 text-amber-700",
  RECEIVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

function toDateInputValue(date: Date | null): string {
  return date ? new Date(date).toISOString().slice(0, 10) : "";
}

export default async function MaterialsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;
  const [job, requests, vendors] = await Promise.all([
    prisma.job.findFirst({ where: { id } }),
    prisma.materialRequest.findMany({
      where: { jobId: id },
      orderBy: { createdAt: "desc" },
      include: { requestedBy: true, vendor: true },
    }),
    prisma.vendor.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!job) notFound();

  const canApprove = canManageEstimates(session.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/jobs/${job.id}`} className="text-sm text-blue-600 hover:underline">
            &larr; {job.title}
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Materials</h1>
          <p className="text-slate-500 text-sm mt-1">Field request → PM approval → PO → ordered → received.</p>
        </div>
        <Link
          href={`/jobs/${job.id}/materials/new`}
          className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
        >
          + Request material
        </Link>
      </div>

      {requests.length === 0 ? (
        <p className="text-slate-500 text-sm">No material requests yet.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="bg-white border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">
                    {r.description} — {r.quantity} {r.unit}
                  </div>
                  <div className="text-xs text-slate-500">
                    {r.requestedBy ? `Requested by ${r.requestedBy.name}` : "Requested"}
                    {r.vendor ? ` · ${r.vendor.name}` : ""}
                    {r.poNumber ? ` · PO ${r.poNumber}` : ""}
                    {r.totalCost ? ` · ${formatMoney(r.totalCost)}` : ""}
                    {r.expectedDeliveryDate ? ` · expected ${formatDate(r.expectedDeliveryDate)}` : ""}
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${STATUS_CLASSES[r.status]}`}>{r.status.replace("_", " ")}</span>
              </div>

              {canApprove && (
                <form action={updateMaterialRequest} className="flex flex-wrap items-end gap-2 pt-2 border-t text-xs">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="jobId" value={job.id} />
                  <div>
                    <label className="block mb-1">Status</label>
                    <select name="status" defaultValue={r.status} className="border rounded-md px-2 py-1">
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1">Vendor</label>
                    <select name="vendorId" defaultValue={r.vendorId ?? ""} className="border rounded-md px-2 py-1 w-28">
                      <option value="">— New (below) —</option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1">New vendor</label>
                    <input name="newVendorName" className="border rounded-md px-2 py-1 w-24" placeholder="Only if new" />
                  </div>
                  <div>
                    <label className="block mb-1">PO #</label>
                    <input name="poNumber" defaultValue={r.poNumber ?? ""} className="border rounded-md px-2 py-1 w-20" />
                  </div>
                  <div>
                    <label className="block mb-1">Unit cost</label>
                    <input name="unitCost" type="number" step="any" min="0" defaultValue={r.unitCost ?? ""} className="border rounded-md px-2 py-1 w-20" />
                  </div>
                  <div>
                    <label className="block mb-1">Total cost</label>
                    <input name="totalCost" type="number" step="any" min="0" defaultValue={r.totalCost ?? ""} className="border rounded-md px-2 py-1 w-24" />
                  </div>
                  <div>
                    <label className="block mb-1">Expected</label>
                    <input name="expectedDeliveryDate" type="date" defaultValue={toDateInputValue(r.expectedDeliveryDate)} className="border rounded-md px-2 py-1" />
                  </div>
                  <div>
                    <label className="block mb-1">Received</label>
                    <input name="receivedDate" type="date" defaultValue={toDateInputValue(r.receivedDate)} className="border rounded-md px-2 py-1" />
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
  );
}
