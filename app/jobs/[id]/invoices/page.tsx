import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateInvoiceStatus } from "@/lib/invoice-actions";
import { requireSession } from "@/lib/session";
import { canManageEstimates } from "@/lib/auth";
import { getBillingReadiness } from "@/lib/billing";
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
  const { id } = await params;
  const [job, invoices, readiness] = await Promise.all([
    prisma.job.findUnique({ where: { id } }),
    prisma.invoice.findMany({ where: { jobId: id }, orderBy: { date: "desc" } }),
    getBillingReadiness(id),
  ]);
  if (!job) notFound();

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
          <p className="text-slate-500 text-sm mt-1">Billed to date (sent + paid): {formatMoney(total)}</p>
        </div>
        {canEdit && (
          <Link
            href={`/jobs/${job.id}/invoices/new`}
            className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
          >
            + New invoice
          </Link>
        )}
      </div>

      {!readiness.ready && (
        <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-4 py-3">
          This job isn&apos;t fully billing-ready yet — see the checklist on the{" "}
          <Link href={`/jobs/${job.id}`} className="underline">
            job page
          </Link>
          . You can still create invoices (e.g. progress billing).
        </div>
      )}

      {invoices.length === 0 ? (
        <p className="text-slate-500 text-sm">No invoices yet.</p>
      ) : (
        <div className="bg-white border rounded-lg divide-y">
          {invoices.map((inv) => (
            <div key={inv.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">
                  {inv.invoiceNumber} — {formatMoney(inv.amount)}
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
          ))}
        </div>
      )}
    </div>
  );
}
