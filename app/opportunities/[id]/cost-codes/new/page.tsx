import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { addOpportunityCostCode } from "@/lib/opportunity-actions";
import { getAllCostCodeRatesMap } from "@/lib/productivity-benchmarks";
import { requirePageRole } from "@/lib/session";
import BudgetLineFields from "@/app/jobs/[id]/cost-codes/new/budget-line-fields";

export default async function NewOpportunityCostCodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePageRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;
  const [opportunity, costCodes, rates] = await Promise.all([
    prisma.opportunity.findFirst({ where: { id } }),
    prisma.costCode.findMany({ orderBy: { code: "asc" } }),
    getAllCostCodeRatesMap(session.companyId),
  ]);

  if (!opportunity) notFound();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href={`/opportunities/${opportunity.id}`} className="text-sm text-blue-600 hover:underline">
          &larr; {opportunity.title}
        </Link>
        <h1 className="text-2xl font-semibold mt-1">Add bid line</h1>
        <p className="text-slate-500 text-sm mt-1">
          The same historical company/recent/recommended rates the Award form shows for a real project — here, before
          the bid is even submitted.
        </p>
      </div>

      {costCodes.length === 0 ? (
        <p className="text-sm text-slate-500">
          No cost codes yet.{" "}
          <Link href="/cost-codes/new" className="text-blue-600 hover:underline">
            Create one first
          </Link>
          .
        </p>
      ) : (
        <form action={addOpportunityCostCode} className="space-y-4 bg-white border rounded-lg p-6">
          <input type="hidden" name="opportunityId" value={opportunity.id} />

          <BudgetLineFields
            costCodes={costCodes.map((cc) => ({ id: cc.id, code: cc.code, description: cc.description, unit: cc.unit }))}
            rates={rates}
          />

          <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
            Add bid line
          </button>
        </form>
      )}
    </div>
  );
}
