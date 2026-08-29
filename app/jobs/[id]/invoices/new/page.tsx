import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { createPayApplication } from "@/lib/invoice-actions";
import { getContract } from "@/lib/contract";
import { requirePageRole } from "@/lib/session";
import PayAppLines from "./pay-app-lines";

function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function NewPayApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePageRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;
  const job = await prisma.job.findFirst({ where: { id } });
  if (!job) notFound();

  const contract = await getContract(session.companyId, id);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={`/jobs/${job.id}/invoices`} className="text-sm text-blue-600 hover:underline">
          &larr; Invoices
        </Link>
        <h1 className="text-2xl font-semibold mt-1">New pay application</h1>
        <p className="text-sm text-slate-500 mt-1">
          Enter this period&apos;s cumulative % complete for each Schedule of Values line — the amount due and
          retainage withheld are computed, not typed.
        </p>
      </div>

      {!contract || contract.lines.length === 0 ? (
        <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-4 py-3">
          This job doesn&apos;t have a Schedule of Values yet.{" "}
          <Link href={`/jobs/${job.id}/contract`} className="underline">
            Set up the contract
          </Link>{" "}
          before billing against it.
        </div>
      ) : (
        <form action={createPayApplication} className="space-y-4 bg-white border rounded-lg p-6">
          <input type="hidden" name="jobId" value={job.id} />

          <PayAppLines
            lines={contract.lines.map((l) => ({
              id: l.id,
              description: l.description,
              scheduledValue: l.scheduledValue,
              priorPct: l.scheduledValue > 0 ? Math.min(100, (l.billedToDate / l.scheduledValue) * 100) : 0,
            }))}
            retainagePct={contract.retainagePct ?? 0}
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Application date *</label>
              <input name="date" type="date" defaultValue={todayLocal()} required className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea name="notes" rows={2} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>

          <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
            Submit pay application
          </button>
        </form>
      )}
    </div>
  );
}
