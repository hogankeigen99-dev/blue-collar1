import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { computeProgress, PRODUCTIVITY_STATUS_LABEL, PRODUCTIVITY_STATUS_CLASSES } from "@/lib/productivity";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export default async function DashboardPage() {
  const [jobs, workerCount, customerCount, jobCostCodes] = await Promise.all([
    prisma.job.findMany({
      orderBy: { scheduledAt: "asc" },
      include: { customer: true, assignments: { include: { worker: true } } },
      take: 10,
    }),
    prisma.worker.count({ where: { active: true } }),
    prisma.customer.count(),
    prisma.jobCostCode.findMany({
      include: { costCode: true, entries: true, job: { select: { id: true, title: true } } },
    }),
  ]);

  const flagged = jobCostCodes
    .map((jcc) => ({ jcc, progress: computeProgress(jcc.estimatedQty, jcc.estimatedHours, jcc.entries) }))
    .filter(({ progress }) => progress.status === "watch" || progress.status === "over_budget")
    .sort((a, b) => (b.progress.hoursVariancePct ?? 0) - (a.progress.hoursVariancePct ?? 0))
    .slice(0, 5);

  const counts = await prisma.job.groupBy({
    by: ["status"],
    _count: true,
  });
  const countByStatus = Object.fromEntries(
    counts.map((c) => [c.status, c._count])
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">
          Overview of jobs, crew, and customers.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Object.entries(STATUS_LABEL).map(([status, label]) => (
          <div key={status} className="bg-white border rounded-lg p-4">
            <div className="text-2xl font-semibold">
              {countByStatus[status] ?? 0}
            </div>
            <div className="text-sm text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-4 text-sm text-slate-600">
        <span>{workerCount} active workers</span>
        <span>&middot;</span>
        <span>{customerCount} customers</span>
      </div>

      {flagged.length > 0 && (
        <div>
          <h2 className="text-lg font-medium mb-3">Labor productivity flags</h2>
          <div className="bg-white border rounded-lg divide-y">
            {flagged.map(({ jcc, progress }) => (
              <Link
                key={jcc.id}
                href={`/jobs/${jcc.job.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <div>
                  <div className="font-medium">{jcc.job.title}</div>
                  <div className="text-sm text-slate-500">
                    {jcc.costCode.code} — {jcc.costCode.description}
                    {progress.hoursVariancePct !== null &&
                      ` · running ${(progress.hoursVariancePct * 100).toFixed(0)}% over budgeted hrs/${jcc.costCode.unit}`}
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${PRODUCTIVITY_STATUS_CLASSES[progress.status]}`}>
                  {PRODUCTIVITY_STATUS_LABEL[progress.status]}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Upcoming / recent jobs</h2>
          <Link href="/jobs/new" className="text-sm text-blue-600 hover:underline">
            + New job
          </Link>
        </div>
        {jobs.length === 0 ? (
          <p className="text-slate-500 text-sm">
            No jobs yet.{" "}
            <Link href="/jobs/new" className="text-blue-600 hover:underline">
              Create the first one
            </Link>
            .
          </p>
        ) : (
          <div className="bg-white border rounded-lg divide-y">
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <div>
                  <div className="font-medium">{job.title}</div>
                  <div className="text-sm text-slate-500">
                    {job.customer?.name ?? "No customer"}
                    {job.assignments.length > 0 &&
                      ` · ${job.assignments.map((a) => a.worker.name).join(", ")}`}
                  </div>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                  {STATUS_LABEL[job.status]}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
