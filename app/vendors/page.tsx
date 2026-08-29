import Link from "next/link";
import { requireSession } from "@/lib/session";
import { canManageJobs } from "@/lib/auth";
import { getVendors } from "@/lib/vendors";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const COI_CLASSES: Record<string, string> = {
  expired: "bg-red-100 text-red-700",
  expiring: "bg-amber-100 text-amber-700",
};

export default async function VendorsPage() {
  const session = await requireSession();
  const vendors = await getVendors(session.companyId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Vendors</h1>
          <p className="text-slate-500 text-sm mt-1">
            Every material and subcontract commitment, rolled up per vendor — not a string re-typed on every job.
          </p>
        </div>
        {canManageJobs(session.role) && (
          <Link href="/vendors/new" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
            + Add vendor
          </Link>
        )}
      </div>

      {vendors.length === 0 ? (
        <p className="text-slate-500 text-sm">No vendors yet.</p>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 font-medium">Trade</th>
                <th className="px-4 py-3 font-medium text-right">Jobs</th>
                <th className="px-4 py-3 font-medium text-right">Material committed</th>
                <th className="px-4 py-3 font-medium text-right">Subcontract committed</th>
                <th className="px-4 py-3 font-medium text-right">Subcontract actual</th>
                <th className="px-4 py-3 font-medium">COI</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {vendors.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-3">
                    <Link href={`/vendors/${v.id}`} className="font-medium text-blue-600 hover:underline">
                      {v.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{v.trade ?? "—"}</td>
                  <td className="px-4 py-3 text-right">{v.jobCount}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(v.materialCommitted)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(v.subcontractCommitted)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(v.subcontractActual)}</td>
                  <td className="px-4 py-3">
                    {v.coiIssue ? (
                      <span className={`text-xs px-2 py-1 rounded-full ${COI_CLASSES[v.coiIssue]}`}>
                        {v.coiIssue === "expired" ? "COI expired" : "COI expiring"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
