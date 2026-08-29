import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { addJobCostCode } from "@/lib/materials-actions";
import { getAllCostCodeRatesMap } from "@/lib/productivity-benchmarks";
import { requirePageRole } from "@/lib/session";
import BudgetLineFields from "./budget-line-fields";

export default async function NewJobCostCodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePageRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;
  const [job, costCodes, rates] = await Promise.all([
    prisma.job.findFirst({ where: { id } }),
    prisma.costCode.findMany({ orderBy: { code: "asc" } }),
    getAllCostCodeRatesMap(session.companyId),
  ]);

  if (!job) notFound();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href={`/jobs/${job.id}`} className="text-sm text-blue-600 hover:underline">
          &larr; {job.title}
        </Link>
        <h1 className="text-2xl font-semibold mt-1">Add budget line</h1>
        <p className="text-slate-500 text-sm mt-1">
          The estimated quantity and hours this job&apos;s bid carries for a cost code —
          actuals logged in the field are measured against this.
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
        <form action={addJobCostCode} className="space-y-4 bg-white border rounded-lg p-6">
          <input type="hidden" name="jobId" value={job.id} />

          <BudgetLineFields
            costCodes={costCodes.map((cc) => ({ id: cc.id, code: cc.code, description: cc.description, unit: cc.unit }))}
            rates={rates}
          />

          <button
            type="submit"
            className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
          >
            Add budget line
          </button>
        </form>
      )}
    </div>
  );
}
