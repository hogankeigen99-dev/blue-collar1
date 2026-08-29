import Link from "next/link";
import { getHistoricalProductivity } from "@/lib/productivity";

export const dynamic = "force-dynamic";

export default async function CostCodesPage() {
  const costCodes = await getHistoricalProductivity();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cost codes</h1>
          <p className="text-slate-500 text-sm mt-1">
            Historical actual productivity across every job — the estimating asset.
          </p>
        </div>
        <Link
          href="/cost-codes/new"
          className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
        >
          + New cost code
        </Link>
      </div>

      {costCodes.length === 0 ? (
        <p className="text-slate-500 text-sm">No cost codes yet.</p>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Unit</th>
                <th className="px-4 py-3 font-medium text-right">Total hours</th>
                <th className="px-4 py-3 font-medium text-right">Total qty</th>
                <th className="px-4 py-3 font-medium text-right">Avg hrs/unit</th>
                <th className="px-4 py-3 font-medium text-right"># jobs</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {costCodes.map((cc) => (
                <tr key={cc.costCodeId}>
                  <td className="px-4 py-3 font-medium">{cc.code}</td>
                  <td className="px-4 py-3 text-slate-600">{cc.description}</td>
                  <td className="px-4 py-3 text-slate-600">{cc.unit}</td>
                  <td className="px-4 py-3 text-right">{cc.totalHours.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right">{cc.totalQty.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {cc.avgRate !== null ? cc.avgRate.toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">{cc.jobCount || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
