import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { updateChangeOrder } from "@/lib/change-order-actions";
import { requireSession } from "@/lib/session";
import { canManageEstimates } from "@/lib/auth";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUSES = ["IDENTIFIED", "PRICED", "SUBMITTED", "APPROVED", "REJECTED"] as const;

const STATUS_CLASSES: Record<string, string> = {
  IDENTIFIED: "bg-slate-100 text-slate-700",
  PRICED: "bg-blue-100 text-blue-700",
  SUBMITTED: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

export default async function ChangeOrdersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;
  const [job, changeOrders] = await Promise.all([
    prisma.job.findFirst({ where: { id } }),
    prisma.changeOrder.findMany({
      where: { jobId: id },
      orderBy: { createdAt: "desc" },
      include: { createdBy: true },
    }),
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
          <h1 className="text-2xl font-semibold mt-1">Change orders</h1>
          <p className="text-slate-500 text-sm mt-1">
            Field identifies extra work → PM prices it → approval adds revenue and budget.
          </p>
        </div>
        <Link
          href={`/jobs/${job.id}/change-orders/new`}
          className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
        >
          + New change order
        </Link>
      </div>

      {changeOrders.length === 0 ? (
        <p className="text-slate-500 text-sm">No change orders yet.</p>
      ) : (
        <div className="space-y-3">
          {changeOrders.map((co) => (
            <div key={co.id} className="bg-white border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{co.title}</div>
                  <div className="text-xs text-slate-500">
                    {co.createdBy ? `Identified by ${co.createdBy.name}` : "Identified"}
                    {co.revenueAmount ? ` · Revenue ${formatMoney(co.revenueAmount)}` : ""}
                    {co.costAmount ? ` · Cost ${formatMoney(co.costAmount)}` : ""}
                  </div>
                  {co.description && <p className="text-sm mt-1">{co.description}</p>}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${STATUS_CLASSES[co.status]}`}>{co.status}</span>
              </div>

              {canApprove && co.status !== "APPROVED" && co.status !== "REJECTED" && (
                <form action={updateChangeOrder} className="flex flex-wrap items-end gap-2 pt-2 border-t text-xs">
                  <input type="hidden" name="id" value={co.id} />
                  <input type="hidden" name="jobId" value={job.id} />
                  <div>
                    <label className="block mb-1">Status</label>
                    <select name="status" defaultValue={co.status} className="border rounded-md px-2 py-1">
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1">Revenue ($)</label>
                    <input name="revenueAmount" type="number" step="any" min="0" defaultValue={co.revenueAmount ?? ""} className="border rounded-md px-2 py-1 w-24" />
                  </div>
                  <div>
                    <label className="block mb-1">Cost ($)</label>
                    <input name="costAmount" type="number" step="any" min="0" defaultValue={co.costAmount ?? ""} className="border rounded-md px-2 py-1 w-24" />
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
