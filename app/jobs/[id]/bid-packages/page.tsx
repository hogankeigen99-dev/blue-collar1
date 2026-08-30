import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { getBidPackages } from "@/lib/subbids";
import { requireSession } from "@/lib/session";
import { canManageEstimates } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_CLASSES: Record<string, string> = {
  OPEN: "bg-amber-100 text-amber-700",
  AWARDED: "bg-green-100 text-green-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

export default async function BidPackagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;
  const job = await prisma.job.findFirst({ where: { id } });
  if (!job) notFound();

  const packages = await getBidPackages(session.companyId, id);
  const canManage = canManageEstimates(session.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/jobs/${job.id}`} className="text-sm text-blue-600 hover:underline">
            &larr; {job.title}
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Bid packages</h1>
          <p className="text-slate-500 text-sm mt-1">
            Scope out to multiple subs, compare what actually came back, award the winner — it becomes a real
            subcontract, not re-typed.
          </p>
        </div>
        {canManage && (
          <Link
            href={`/jobs/${job.id}/bid-packages/new`}
            className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
          >
            + New bid package
          </Link>
        )}
      </div>

      {packages.length === 0 ? (
        <p className="text-slate-500 text-sm">No bid packages yet.</p>
      ) : (
        <div className="space-y-3">
          {packages.map((p) => (
            <Link
              key={p.id}
              href={`/jobs/${job.id}/bid-packages/${p.id}`}
              className="block bg-white border rounded-lg p-4 hover:border-slate-400"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="font-medium text-sm">{p.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {p.bidCount} bid{p.bidCount === 1 ? "" : "s"} invited · {p.receivedCount} received
                    {p.lowAmount !== null && p.highAmount !== null
                      ? ` · ${formatMoney(p.lowAmount)}${p.lowAmount !== p.highAmount ? ` – ${formatMoney(p.highAmount)}` : ""}`
                      : ""}
                    {p.dueDate ? ` · due ${formatDate(p.dueDate)}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p.status === "AWARDED" && p.awardedAmount !== null && (
                    <span className="text-sm font-medium text-green-700">{formatMoney(p.awardedAmount)}</span>
                  )}
                  <span className={`text-xs px-2 py-1 rounded-full ${STATUS_CLASSES[p.status]}`}>{p.status}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
