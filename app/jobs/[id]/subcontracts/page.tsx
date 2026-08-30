import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { updateSubcontract, releaseSubcontractRetainage } from "@/lib/subcontract-actions";
import { requireSession } from "@/lib/session";
import { canManageEstimates } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUSES = ["COMMITTED", "INVOICED", "PAID"] as const;
const AGREEMENT_STATUSES = ["DRAFT", "EXECUTED", "CLOSED"] as const;

const STATUS_CLASSES: Record<string, string> = {
  COMMITTED: "bg-slate-100 text-slate-700",
  INVOICED: "bg-amber-100 text-amber-700",
  PAID: "bg-green-100 text-green-700",
};

const AGREEMENT_CLASSES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  EXECUTED: "bg-blue-100 text-blue-700",
  CLOSED: "bg-purple-100 text-purple-700",
};

function toDateInputValue(date: Date | null): string {
  return date ? new Date(date).toISOString().slice(0, 10) : "";
}

export default async function SubcontractsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;
  const [job, subcontracts] = await Promise.all([
    prisma.job.findFirst({ where: { id } }),
    prisma.subcontract.findMany({ where: { jobId: id }, include: { vendor: true }, orderBy: { createdAt: "desc" } }),
  ]);
  if (!job) notFound();

  const canManage = canManageEstimates(session.role);
  const totalCommitted = subcontracts.reduce((s, c) => s + c.committedAmount, 0);
  const totalActual = subcontracts.reduce((s, c) => s + c.actualAmount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/jobs/${job.id}`} className="text-sm text-blue-600 hover:underline">
            &larr; {job.title}
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Subcontracts</h1>
          <p className="text-slate-500 text-sm mt-1">
            Committed {formatMoney(totalCommitted)} · Actual {formatMoney(totalActual)}
          </p>
        </div>
        {canManage && (
          <Link
            href={`/jobs/${job.id}/subcontracts/new`}
            className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
          >
            + New subcontract
          </Link>
        )}
      </div>

      {subcontracts.length === 0 ? (
        <p className="text-slate-500 text-sm">No subcontracts yet.</p>
      ) : (
        <div className="space-y-3">
          {subcontracts.map((c) => (
            <div key={c.id} className="bg-white border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="font-medium text-sm">
                    {c.vendor ? (
                      <Link href={`/vendors/${c.vendor.id}`} className="hover:underline">
                        {c.vendor.name}
                      </Link>
                    ) : (
                      "Unnamed vendor"
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {c.description ?? "—"} · Committed {formatMoney(c.committedAmount)} · Actual {formatMoney(c.actualAmount)}
                    {c.retainagePct !== null
                      ? c.retainageReleasedAt
                        ? ` · Retainage ${c.retainagePct}% released ${formatDate(c.retainageReleasedAt)}`
                        : ` · Retainage ${c.retainagePct}% held`
                      : ""}
                    {c.coiExpirationDate ? ` · COI expires ${formatDate(c.coiExpirationDate)}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${AGREEMENT_CLASSES[c.agreementStatus]}`}>
                    {c.agreementStatus}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full ${STATUS_CLASSES[c.status]}`}>{c.status}</span>
                </div>
              </div>

              {canManage && (
                <form action={updateSubcontract} className="flex flex-wrap items-end gap-2 pt-2 border-t text-xs">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="jobId" value={job.id} />
                  <div>
                    <label className="block mb-1">Agreement</label>
                    <select name="agreementStatus" defaultValue={c.agreementStatus} className="border rounded-md px-2 py-1">
                      {AGREEMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1">Billing status</label>
                    <select name="status" defaultValue={c.status} className="border rounded-md px-2 py-1">
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1">Actual amount</label>
                    <input name="actualAmount" type="number" step="any" min="0" defaultValue={c.actualAmount} className="border rounded-md px-2 py-1 w-24" />
                  </div>
                  <div>
                    <label className="block mb-1">COI expires</label>
                    <input name="coiExpirationDate" type="date" defaultValue={toDateInputValue(c.coiExpirationDate)} className="border rounded-md px-2 py-1" />
                  </div>
                  <button type="submit" className="bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-700">
                    Save
                  </button>
                </form>
              )}

              {canManage && c.status === "PAID" && c.retainagePct !== null && c.retainagePct > 0 && !c.retainageReleasedAt && (
                <form action={releaseSubcontractRetainage} className="pt-2 border-t">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="jobId" value={job.id} />
                  <button type="submit" className="bg-white border text-xs px-3 py-1.5 rounded-md hover:bg-slate-50">
                    Release {formatMoney(c.actualAmount * (c.retainagePct / 100))} retainage
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
