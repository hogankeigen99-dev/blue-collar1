import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateJobStatus, deleteJob } from "@/lib/actions";
import { computeProgress, PRODUCTIVITY_STATUS_LABEL, PRODUCTIVITY_STATUS_CLASSES } from "@/lib/productivity";

const STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [job, jobCostCodes] = await Promise.all([
    prisma.job.findUnique({
      where: { id },
      include: { customer: true, assignments: { include: { worker: true } } },
    }),
    prisma.jobCostCode.findMany({
      where: { jobId: id },
      include: { costCode: true, entries: { orderBy: { date: "desc" } } },
      orderBy: { costCode: { code: "asc" } },
    }),
  ]);

  if (!job) notFound();

  async function setStatus(formData: FormData) {
    "use server";
    const status = formData.get("status");
    if (typeof status === "string") {
      await updateJobStatus(job!.id, status);
    }
  }

  async function removeJob() {
    "use server";
    await deleteJob(job!.id);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{job.title}</h1>
        {job.customer && (
          <p className="text-slate-500 text-sm mt-1">For {job.customer.name}</p>
        )}
      </div>

      <div className="max-w-2xl bg-white border rounded-lg p-6 space-y-4">
        {job.description && (
          <div>
            <div className="text-sm font-medium text-slate-500">Description</div>
            <p className="text-sm">{job.description}</p>
          </div>
        )}
        {job.address && (
          <div>
            <div className="text-sm font-medium text-slate-500">Address</div>
            <p className="text-sm">{job.address}</p>
          </div>
        )}
        {job.scheduledAt && (
          <div>
            <div className="text-sm font-medium text-slate-500">Scheduled</div>
            <p className="text-sm">{new Date(job.scheduledAt).toLocaleString()}</p>
          </div>
        )}
        <div>
          <div className="text-sm font-medium text-slate-500">Assigned workers</div>
          {job.assignments.length === 0 ? (
            <p className="text-sm text-slate-500">None assigned</p>
          ) : (
            <ul className="text-sm list-disc list-inside">
              {job.assignments.map((a) => (
                <li key={a.id}>
                  {a.worker.name} {a.worker.role && `(${a.worker.role})`}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="text-sm font-medium text-slate-500 mb-1">Status</div>
          <form action={setStatus} className="flex items-center gap-2">
            <select
              name="status"
              defaultValue={job.status}
              className="border rounded-md px-3 py-2 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="bg-slate-900 text-white text-sm px-3 py-2 rounded-md hover:bg-slate-700"
            >
              Update
            </button>
          </form>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Labor productivity</h2>
          <div className="flex gap-3 text-sm">
            <Link href={`/jobs/${job.id}/cost-codes/new`} className="text-blue-600 hover:underline">
              + Add budget line
            </Link>
            <Link href={`/jobs/${job.id}/log`} className="text-blue-600 hover:underline">
              + Log production
            </Link>
          </div>
        </div>

        {jobCostCodes.length === 0 ? (
          <p className="text-slate-500 text-sm">
            No cost code budgets yet. Add one to start tracking actual vs. estimated
            productivity for this job.
          </p>
        ) : (
          <div className="bg-white border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="px-4 py-3 font-medium">Cost code</th>
                  <th className="px-4 py-3 font-medium text-right">Est qty</th>
                  <th className="px-4 py-3 font-medium text-right">Actual qty</th>
                  <th className="px-4 py-3 font-medium text-right">Est hrs</th>
                  <th className="px-4 py-3 font-medium text-right">Actual hrs</th>
                  <th className="px-4 py-3 font-medium text-right">Est rate</th>
                  <th className="px-4 py-3 font-medium text-right">Actual rate</th>
                  <th className="px-4 py-3 font-medium text-right">Variance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {jobCostCodes.map((jcc) => {
                  const progress = computeProgress(jcc.estimatedQty, jcc.estimatedHours, jcc.entries);
                  return (
                    <tr key={jcc.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium">{jcc.costCode.code}</div>
                        <div className="text-slate-500 text-xs">
                          {jcc.costCode.description} ({jcc.costCode.unit})
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">{jcc.estimatedQty}</td>
                      <td className="px-4 py-3 text-right">{progress.actualQty || "—"}</td>
                      <td className="px-4 py-3 text-right">{jcc.estimatedHours}</td>
                      <td className="px-4 py-3 text-right">{progress.actualHours || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        {progress.estimatedRate !== null ? progress.estimatedRate.toFixed(2) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {progress.actualRate !== null ? progress.actualRate.toFixed(2) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {progress.hoursVariancePct !== null
                          ? `${progress.hoursVariancePct >= 0 ? "+" : ""}${(
                              progress.hoursVariancePct * 100
                            ).toFixed(0)}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${PRODUCTIVITY_STATUS_CLASSES[progress.status]}`}
                        >
                          {PRODUCTIVITY_STATUS_LABEL[progress.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {jobCostCodes.some((jcc) => jcc.entries.length > 0) && (
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
              Daily production log
            </summary>
            <div className="bg-white border rounded-lg divide-y mt-2">
              {jobCostCodes
                .flatMap((jcc) =>
                  jcc.entries.map((e) => ({ ...e, costCode: jcc.costCode }))
                )
                .sort((a, b) => b.date.getTime() - a.date.getTime())
                .map((e) => (
                  <div key={e.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">
                        {e.costCode.code} — {new Date(e.date).toLocaleDateString()}
                      </div>
                      <div className="text-slate-500 text-xs">
                        {e.hours} hrs · {e.quantity} {e.costCode.unit}
                        {e.crewSize ? ` · crew of ${e.crewSize}` : ""}
                        {e.notes ? ` · ${e.notes}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </details>
        )}
      </div>

      <form action={removeJob}>
        <button
          type="submit"
          className="text-sm text-red-600 hover:underline"
        >
          Delete job
        </button>
      </form>
    </div>
  );
}
