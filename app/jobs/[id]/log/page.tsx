import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { requireSession } from "@/lib/session";
import { logProduction } from "@/lib/materials-actions";

function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function LogProductionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;
  const [job, jobCostCodes, workers] = await Promise.all([
    prisma.job.findFirst({ where: { id } }),
    prisma.jobCostCode.findMany({
      where: { jobId: id },
      include: { costCode: true },
      orderBy: { costCode: { code: "asc" } },
    }),
    prisma.worker.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  if (!job) notFound();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href={`/jobs/${job.id}`} className="text-sm text-blue-600 hover:underline">
          &larr; {job.title}
        </Link>
        <h1 className="text-2xl font-semibold mt-1">Log production</h1>
        <p className="text-slate-500 text-sm mt-1">
          Record today&apos;s crew hours and quantity installed — this rolls straight into
          the job&apos;s actual-vs-estimated productivity, same day.
        </p>
      </div>

      {jobCostCodes.length === 0 ? (
        <p className="text-sm text-slate-500">
          This job has no budget lines yet.{" "}
          <Link href={`/jobs/${job.id}/cost-codes/new`} className="text-blue-600 hover:underline">
            Add one first
          </Link>
          .
        </p>
      ) : (
        <form action={logProduction} className="space-y-4 bg-white border rounded-lg p-6">
          <input type="hidden" name="jobId" value={job.id} />

          <div>
            <label className="block text-sm font-medium mb-1">Cost code *</label>
            <select
              name="jobCostCodeId"
              required
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              {jobCostCodes.map((jcc) => (
                <option key={jcc.id} value={jcc.id}>
                  {jcc.costCode.code} — {jcc.costCode.description} ({jcc.costCode.unit})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Date *</label>
            <input
              name="date"
              type="date"
              defaultValue={todayLocal()}
              required
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Crew hours *</label>
              <input
                name="hours"
                type="number"
                step="any"
                min="0"
                required
                placeholder="Total for the crew"
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Quantity installed *</label>
              <input
                name="quantity"
                type="number"
                step="any"
                min="0"
                required
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Crew size</label>
            <input
              name="crewSize"
              type="number"
              step="1"
              min="0"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Entered by</label>
            <select name="enteredById" className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">— None —</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              name="notes"
              rows={2}
              placeholder="Weather delays, rework, access issues…"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
          >
            Log production
          </button>
        </form>
      )}
    </div>
  );
}
