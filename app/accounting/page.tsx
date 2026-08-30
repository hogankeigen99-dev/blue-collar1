import Link from "next/link";
import { scopedPrisma } from "@/lib/tenant";
import { setAccountingMapping, setCostCodeGlCode } from "@/lib/accounting-actions";
import { requirePageRole } from "@/lib/session";
import { COST_CATEGORY_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

const CATEGORIES = ["LABOR", "MATERIAL", "EQUIPMENT", "SUBCONTRACTOR", "OTHER"] as const;

export default async function AccountingPage() {
  const session = await requirePageRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);

  const [mappings, costCodes] = await Promise.all([
    prisma.accountingCategoryMapping.findMany(),
    prisma.costCode.findMany({ orderBy: { code: "asc" } }),
  ]);
  const mappingByCategory = Object.fromEntries(mappings.map((m) => [m.category, m]));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Accounting</h1>
          <p className="text-slate-500 text-sm mt-1">
            GL code mapping used by each job&apos;s CSV export — set these once so exports are
            ready to import into your accounting system (QuickBooks, Sage, Foundation, etc.)
            without hand-remapping every time.
          </p>
        </div>
        <Link href="/cash" className="text-sm text-blue-600 hover:underline whitespace-nowrap">
          AR/AP, retainage & needs action →
        </Link>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Cost category → GL account</h2>
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">GL code</th>
                <th className="px-4 py-3 font-medium">GL account name</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {CATEGORIES.map((c) => {
                const existing = mappingByCategory[c];
                return (
                  <tr key={c}>
                    <td className="px-4 py-3 font-medium">{COST_CATEGORY_LABEL[c]}</td>
                    <td colSpan={3} className="px-4 py-2">
                      <form action={setAccountingMapping} className="flex items-center gap-2">
                        <input type="hidden" name="category" value={c} />
                        <input
                          name="glCode"
                          placeholder="e.g. 6100"
                          defaultValue={existing?.glCode ?? ""}
                          className="border rounded-md px-2 py-1 w-28"
                        />
                        <input
                          name="glAccountName"
                          placeholder="e.g. Direct Labor"
                          defaultValue={existing?.glAccountName ?? ""}
                          className="border rounded-md px-2 py-1 flex-1"
                        />
                        <button type="submit" className="bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-700 text-xs">
                          Save
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Cost code → GL code</h2>
        {costCodes.length === 0 ? (
          <p className="text-slate-500 text-sm">No cost codes yet.</p>
        ) : (
          <div className="bg-white border rounded-lg divide-y">
            {costCodes.map((cc) => (
              <div key={cc.id} className="px-4 py-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{cc.code}</div>
                  <div className="text-slate-500 text-xs">{cc.description}</div>
                </div>
                <form action={setCostCodeGlCode} className="flex items-center gap-2">
                  <input type="hidden" name="costCodeId" value={cc.id} />
                  <input name="glCode" defaultValue={cc.glCode ?? ""} placeholder="GL code" className="border rounded-md px-2 py-1 w-32 text-xs" />
                  <button type="submit" className="bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-700 text-xs">
                    Save
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
