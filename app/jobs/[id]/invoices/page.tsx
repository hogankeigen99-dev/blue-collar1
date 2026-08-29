import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { updateInvoiceStatus } from "@/lib/invoice-actions";
import { requireSession } from "@/lib/session";
import { canManageEstimates } from "@/lib/auth";
import { getBillingReadiness } from "@/lib/billing";
import { getContract } from "@/lib/contract";
import { formatMoney, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUSES = ["DRAFT", "SENT", "PAID"] as const;
const STATUS_CLASSES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SENT: "bg-amber-100 text-amber-700",
  PAID: "bg-green-100 text-green-700",
};

export default async function InvoicesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;

  // getBillingReadiness uses findFirstOrThrow — resolve the job (and
  // confirm company ownership) first so a cross-tenant id guess 404s
  // cleanly instead of throwing a 500.
  const job = await prisma.job.findFirst({ where: { id } });
  if (!job) notFound();

  const [invoices, readiness, contract] = await Promise.all([
    prisma.invoice.findMany({
      where: { jobId: id },
      orderBy: { date: "desc" },
      include: { lines: { include: { contractLine: true } } },
    }),
    getBillingReadiness(session.companyId, id),
    getContract(session.companyId, id),
  ]);

  const canEdit = canManageEstimates(session.role);
  const total = invoices.reduce((s, i) => s + (i.status === "SENT" || i.status === "PAID" ? i.amount : 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/jobs/${job.id}`} className="text-sm text-blue-600 hover:underline">
            &larr; {job.title}
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Invoices</h1>
          <p className="text-slate-500 text-sm mt-1">Billed to date (sent + paid, net of retainage): {formatMoney(total)}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/jobs/${job.id}/contract`} className="bg-white border text-sm px-4 py-2 rounded-md hover:bg-slate-50">
            Contract &amp; SOV
          </Link>
          {canEdit && (
            <Link
              href={`/jobs/${job.id}/invoices/new`}
              className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
            >
              + New pay application
            </Link>
          )}
        </div>
      </div>

      {!readiness.ready && (
        <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-4 py-3">
          This job isn&apos;t fully billing-ready yet — see the checklist on the{" "}
          <Link href={`/jobs/${job.id}`} className="underline">
            job page
          </Link>
          . You can still create pay applications (progress billing) before every check passes.
        </div>
      )}

      {contract && contract.lines.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-medium">Schedule of Values — billed to date</h2>
          <div className="bg-white border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="px-4 py-3 font-medium">Line</th>
                  <th className="px-4 py-3 font-medium text-right">Scheduled value</th>
                  <th className="px-4 py-3 font-medium text-right">Billed to date</th>
                  <th className="px-4 py-3 font-medium text-right">Remaining</th>
                  <th className="px-4 py-3 font-medium text-right">% billed</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {contract.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-3">
                      {l.description}
                      {l.sourceChangeOrderId && <span className="text-xs text-slate-400 ml-1">(change order)</span>}
                    </td>
                    <td className="px-4 py-3 text-right">{formatMoney(l.scheduledValue)}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(l.billedToDate)}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(l.remainingToBill)}</td>
                    <td className="px-4 py-3 text-right">
                      {l.scheduledValue > 0 ? `${((l.billedToDate / l.scheduledValue) * 100).toFixed(0)}%` : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="font-medium bg-slate-50">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right">{formatMoney(contract.scheduledTotal)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(contract.billedTotal)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(contract.scheduledTotal - contract.billedTotal)}</td>
                  <td className="px-4 py-3 text-right">
                    {contract.scheduledTotal > 0 ? `${((contract.billedTotal / contract.scheduledTotal) * 100).toFixed(0)}%` : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-lg font-medium">Pay applications</h2>
        {invoices.length === 0 ? (
          <p className="text-slate-500 text-sm">No invoices yet.</p>
        ) : (
          <div className="bg-white border rounded-lg divide-y">
            {invoices.map((inv) => (
              <div key={inv.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">
                      {inv.invoiceNumber} — {formatMoney(inv.amount)} due
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatDate(inv.date)}
                      {inv.notes ? ` · ${inv.notes}` : ""}
                    </div>
                  </div>
                  {canEdit ? (
                    <form action={updateInvoiceStatus} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={inv.id} />
                      <input type="hidden" name="jobId" value={job.id} />
                      <select name="status" defaultValue={inv.status} className="border rounded-md px-2 py-1 text-xs">
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="bg-slate-900 text-white text-xs px-2 py-1 rounded-md hover:bg-slate-700">
                        Save
                      </button>
                    </form>
                  ) : (
                    <span className={`text-xs px-2 py-1 rounded-full ${STATUS_CLASSES[inv.status]}`}>{inv.status}</span>
                  )}
                </div>
                {inv.lines.length > 0 && (
                  <div className="text-xs text-slate-500 pl-1 space-y-0.5">
                    {inv.lines.map((l) => (
                      <div key={l.id}>
                        {l.contractLine.description} — {l.pctCompleteToDate.toFixed(0)}% complete, {formatMoney(l.amountThisPeriod)} earned
                        {l.retainageWithheld > 0 ? `, ${formatMoney(l.retainageWithheld)} retainage withheld` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
