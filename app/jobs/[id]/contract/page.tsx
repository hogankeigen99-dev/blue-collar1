import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { requireSession } from "@/lib/session";
import { canManageEstimates } from "@/lib/auth";
import { getContract } from "@/lib/contract";
import { updateContract, addContractLine, deleteContractLine } from "@/lib/contract-actions";
import { formatMoney, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const CONTRACT_TYPES = [
  { value: "LUMP_SUM", label: "Lump sum" },
  { value: "GMP", label: "GMP" },
  { value: "COST_PLUS", label: "Cost plus" },
  { value: "TIME_AND_MATERIALS", label: "Time & materials" },
] as const;

export default async function ContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;

  const job = await prisma.job.findFirst({ where: { id } });
  if (!job) notFound();

  const contract = await getContract(session.companyId, id);
  const canEdit = canManageEstimates(session.role);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={`/jobs/${job.id}`} className="text-sm text-blue-600 hover:underline">
          &larr; {job.title}
        </Link>
        <h1 className="text-2xl font-semibold mt-1">Contract &amp; Schedule of Values</h1>
        <p className="text-sm text-slate-500 mt-1">
          The owner-facing billing breakdown — deliberately separate from cost codes, which track internal cost.{" "}
          <Link href={`/jobs/${job.id}/invoices`} className="text-blue-600 hover:underline">
            Pay applications bill against these lines
          </Link>
          . The signed contract document itself can be uploaded on the{" "}
          <Link href={`/jobs/${job.id}/documents`} className="text-blue-600 hover:underline">
            Documents
          </Link>{" "}
          tab (category: Contract).
        </p>
      </div>

      {!contract ? (
        <div className="bg-white border rounded-lg p-6 text-sm text-slate-500">
          No contract set up yet — this job was created before a contract value was entered, or without going
          through the Award flow.
          {canEdit && " Add a Schedule of Values line below to start one."}
        </div>
      ) : (
        <div className="bg-white border rounded-lg p-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-slate-500 text-xs">Type</div>
            <div className="font-medium">{CONTRACT_TYPES.find((t) => t.value === contract.type)?.label ?? contract.type}</div>
          </div>
          <div>
            <div className="text-slate-500 text-xs">Retainage</div>
            <div className="font-medium">{contract.retainagePct !== null ? `${contract.retainagePct}%` : "—"}</div>
          </div>
          <div>
            <div className="text-slate-500 text-xs">Executed</div>
            <div className="font-medium">{formatDate(contract.executedDate)}</div>
          </div>
          <div>
            <div className="text-slate-500 text-xs">Scheduled value (current contract value)</div>
            <div className="font-medium">{formatMoney(contract.scheduledTotal)}</div>
          </div>
        </div>
      )}

      {canEdit && (
        <details className="text-sm" open={!contract}>
          <summary className="cursor-pointer text-slate-500 hover:text-slate-700">Edit contract terms</summary>
          <form action={updateContract} className="mt-2 flex flex-wrap items-end gap-3 bg-white border rounded-lg p-4">
            <input type="hidden" name="jobId" value={job.id} />
            <div>
              <label className="block text-xs font-medium mb-1">Type</label>
              <select name="type" defaultValue={contract?.type ?? "LUMP_SUM"} className="border rounded-md px-3 py-2 text-sm">
                {CONTRACT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Retainage (%)</label>
              <input
                name="retainagePct"
                type="number"
                step="any"
                min="0"
                max="100"
                defaultValue={contract?.retainagePct ?? ""}
                className="w-28 border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Executed date</label>
              <input
                name="executedDate"
                type="date"
                defaultValue={contract?.executedDate ? new Date(contract.executedDate).toISOString().slice(0, 10) : ""}
                className="border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <button type="submit" className="bg-slate-900 text-white text-sm px-3 py-2 rounded-md hover:bg-slate-700">
              Save
            </button>
          </form>
        </details>
      )}

      {contract && contract.lines.length > 0 && (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-4 py-3 font-medium">Line</th>
                <th className="px-4 py-3 font-medium text-right">Scheduled value</th>
                <th className="px-4 py-3 font-medium text-right">Billed to date</th>
                <th className="px-4 py-3 font-medium text-right">Remaining</th>
                {canEdit && <th className="px-4 py-3"></th>}
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
                  {canEdit && (
                    <td className="px-4 py-3 text-right">
                      {!l.sourceChangeOrderId && l.billedToDate === 0 && (
                        <form action={deleteContractLine}>
                          <input type="hidden" name="jobId" value={job.id} />
                          <input type="hidden" name="lineId" value={l.id} />
                          <button type="submit" className="text-slate-400 hover:text-red-600 text-xs">
                            Remove
                          </button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              <tr className="font-medium bg-slate-50">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">{formatMoney(contract.scheduledTotal)}</td>
                <td className="px-4 py-3 text-right">{formatMoney(contract.billedTotal)}</td>
                <td className="px-4 py-3 text-right">{formatMoney(contract.scheduledTotal - contract.billedTotal)}</td>
                {canEdit && <td></td>}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500 hover:text-slate-700">+ Add Schedule of Values line</summary>
          <form action={addContractLine} className="mt-2 flex flex-wrap items-end gap-3 bg-white border rounded-lg p-4">
            <input type="hidden" name="jobId" value={job.id} />
            <div className="flex-1 min-w-[12rem]">
              <label className="block text-xs font-medium mb-1">Description</label>
              <input name="description" required className="w-full border rounded-md px-3 py-2 text-sm" placeholder="e.g. Mobilization" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Scheduled value ($)</label>
              <input name="scheduledValue" type="number" step="any" min="0" required className="w-32 border rounded-md px-3 py-2 text-sm" />
            </div>
            <button type="submit" className="bg-slate-900 text-white text-sm px-3 py-2 rounded-md hover:bg-slate-700">
              Add
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
