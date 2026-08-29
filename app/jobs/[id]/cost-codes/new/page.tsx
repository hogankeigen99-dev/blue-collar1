import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addJobCostCode } from "@/lib/productivity-actions";

export default async function NewJobCostCodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [job, costCodes] = await Promise.all([
    prisma.job.findUnique({ where: { id } }),
    prisma.costCode.findMany({ orderBy: { code: "asc" } }),
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

          <div>
            <label className="block text-sm font-medium mb-1">Cost code *</label>
            <select name="costCodeId" required className="w-full border rounded-md px-3 py-2 text-sm">
              {costCodes.map((cc) => (
                <option key={cc.id} value={cc.id}>
                  {cc.code} — {cc.description} ({cc.unit})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Estimated quantity *</label>
            <input
              name="estimatedQty"
              type="number"
              step="any"
              min="0"
              required
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Estimated hours *</label>
            <input
              name="estimatedHours"
              type="number"
              step="any"
              min="0"
              required
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

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
