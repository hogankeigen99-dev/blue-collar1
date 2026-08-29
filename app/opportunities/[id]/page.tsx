import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { getOpportunity } from "@/lib/opportunities";
import { updateOpportunity, markOpportunityLost } from "@/lib/opportunity-actions";
import { requireSession } from "@/lib/session";
import { canManageEstimates } from "@/lib/auth";
import { formatMoney, formatDate, OPPORTUNITY_STAGE_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

const OPEN_STAGES = ["OPPORTUNITY", "BIDDING", "SUBMITTED"];

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;
  const opportunity = await getOpportunity(session.companyId, id);
  if (!opportunity) notFound();

  const isOpen = OPEN_STAGES.includes(opportunity.stage);
  const canManage = canManageEstimates(session.role);
  const pmUsers = canManage
    ? await prisma.user.findMany({ where: { role: { in: ["ADMIN", "PM"] }, active: true }, orderBy: { name: "asc" } })
    : [];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/opportunities" className="text-sm text-blue-600 hover:underline">
          &larr; Pipeline
        </Link>
        <div className="flex items-start justify-between mt-1">
          <div>
            <h1 className="text-2xl font-semibold">{opportunity.title}</h1>
            <p className="text-slate-500 text-sm mt-1">
              {opportunity.bidNumber} · {opportunity.customerName ?? "No customer yet"}
              {opportunity.projectType ? ` · ${opportunity.projectType}` : ""}
            </p>
          </div>
          <span
            className={`text-xs px-2.5 py-1.5 rounded-full whitespace-nowrap ${
              opportunity.stage === "WON"
                ? "bg-green-100 text-green-700"
                : opportunity.stage === "LOST" || opportunity.stage === "NO_BID"
                  ? "bg-red-100 text-red-700"
                  : "bg-blue-100 text-blue-700"
            }`}
          >
            {OPPORTUNITY_STAGE_LABEL[opportunity.stage]}
          </span>
        </div>
      </div>

      {opportunity.stage === "WON" && opportunity.wonJobId && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm">
          Won — became{" "}
          <Link href={`/jobs/${opportunity.wonJobId}`} className="font-medium text-green-800 hover:underline">
            the real project →
          </Link>
        </div>
      )}
      {(opportunity.stage === "LOST" || opportunity.stage === "NO_BID") && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm">
          <span className="font-medium">{OPPORTUNITY_STAGE_LABEL[opportunity.stage]}</span>
          {opportunity.lostReason ? ` — ${opportunity.lostReason}` : ""}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">Estimated value</div>
          <div className="text-lg font-semibold mt-1">{opportunity.estimatedValue !== null ? formatMoney(opportunity.estimatedValue) : "—"}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">Win probability</div>
          <div className="text-lg font-semibold mt-1">{opportunity.probability !== null ? `${opportunity.probability}%` : "—"}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">Bid due</div>
          <div className="text-lg font-semibold mt-1">{formatDate(opportunity.bidDueDate)}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">Assigned to</div>
          <div className="text-lg font-semibold mt-1">{opportunity.assignedToName ?? "—"}</div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Bid lines</h2>
          {isOpen && canManage && (
            <Link href={`/opportunities/${opportunity.id}/cost-codes/new`} className="text-sm text-blue-600 hover:underline">
              + Add bid line
            </Link>
          )}
        </div>
        {opportunity.costCodes.length === 0 ? (
          <p className="text-slate-500 text-sm bg-white border rounded-lg p-6">
            No bid lines yet. Add cost codes to build the estimate — historical rates surface right there.
          </p>
        ) : (
          <div className="bg-white border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="px-4 py-3 font-medium">Cost code</th>
                  <th className="px-4 py-3 font-medium text-right">Est. qty</th>
                  <th className="px-4 py-3 font-medium text-right">Est. hours</th>
                  <th className="px-4 py-3 font-medium text-right">Est. rate</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {opportunity.costCodes.map((cc) => (
                  <tr key={cc.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{cc.code}</div>
                      <div className="text-xs text-slate-400">{cc.description}</div>
                    </td>
                    <td className="px-4 py-3 text-right">{cc.estimatedQty} {cc.unit}</td>
                    <td className="px-4 py-3 text-right">{cc.estimatedHours}</td>
                    <td className="px-4 py-3 text-right">{cc.estimatedQty > 0 ? (cc.estimatedHours / cc.estimatedQty).toFixed(2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isOpen && canManage && (
        <div className="space-y-6">
          <div className="bg-white border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-medium">Update bid details</h2>
            <form action={updateOpportunity} className="space-y-4">
              <input type="hidden" name="opportunityId" value={opportunity.id} />
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Estimated value ($)</label>
                  <input
                    name="estimatedValue"
                    type="number"
                    step="any"
                    min="0"
                    defaultValue={opportunity.estimatedValue ?? ""}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Win probability (%)</label>
                  <input
                    name="probability"
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    defaultValue={opportunity.probability ?? ""}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Bid due date</label>
                  <input
                    name="bidDueDate"
                    type="date"
                    defaultValue={opportunity.bidDueDate ? opportunity.bidDueDate.toISOString().slice(0, 10) : ""}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Stage</label>
                  <select name="stage" defaultValue={opportunity.stage} className="w-full border rounded-md px-3 py-2 text-sm">
                    <option value="OPPORTUNITY">{OPPORTUNITY_STAGE_LABEL.OPPORTUNITY}</option>
                    <option value="BIDDING">{OPPORTUNITY_STAGE_LABEL.BIDDING}</option>
                    <option value="SUBMITTED">{OPPORTUNITY_STAGE_LABEL.SUBMITTED}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Assigned to</label>
                  <select name="assignedToUserId" defaultValue="" className="w-full border rounded-md px-3 py-2 text-sm">
                    <option value="">— None —</option>
                    {pmUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
                Save
              </button>
            </form>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="bg-green-50 border border-green-200 rounded-lg p-5 space-y-2">
              <h2 className="font-medium text-green-900">Won it</h2>
              <p className="text-sm text-green-800">
                Opens the Award form pre-filled from this bid — title, customer, contract value, project type, and
                every bid line. Nothing gets re-entered.
              </p>
              <Link
                href={`/jobs/new?opportunityId=${opportunity.id}`}
                className="inline-block bg-green-700 text-white text-sm px-4 py-2 rounded-md hover:bg-green-800"
              >
                Mark won → Award project
              </Link>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-5 space-y-2">
              <h2 className="font-medium text-red-900">Didn&apos;t win it</h2>
              <form action={markOpportunityLost} className="space-y-2">
                <input type="hidden" name="opportunityId" value={opportunity.id} />
                <select name="stage" className="w-full border rounded-md px-3 py-2 text-sm">
                  <option value="LOST">Lost — we bid, didn&apos;t win</option>
                  <option value="NO_BID">No-bid — declined to bid</option>
                </select>
                <input name="lostReason" placeholder="Reason (optional)" className="w-full border rounded-md px-3 py-2 text-sm" />
                <button type="submit" className="bg-red-700 text-white text-sm px-4 py-2 rounded-md hover:bg-red-800">
                  Save outcome
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
