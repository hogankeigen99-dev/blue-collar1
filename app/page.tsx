import Link from "next/link";
import { scopedPrisma } from "@/lib/tenant";
import { getAlerts, ALERT_TYPE_LABEL } from "@/lib/alerts";
import { requireSession } from "@/lib/session";
import { canManageJobs } from "@/lib/auth";

const SEVERITY_CLASSES: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  warning: "bg-amber-100 text-amber-700",
};

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export default async function DashboardPage() {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const [jobs, workerCount, customerCount, alerts] = await Promise.all([
    prisma.job.findMany({
      orderBy: { scheduledAt: "asc" },
      include: { customer: true, assignments: { include: { worker: true } } },
      take: 10,
    }),
    prisma.worker.count({ where: { active: true } }),
    prisma.customer.count(),
    getAlerts(session.companyId),
  ]);

  const topAlerts = alerts.slice(0, 5);

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

      {topAlerts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium">Exception alerts</h2>
            <Link href="/alerts" className="text-sm text-blue-600 hover:underline">
              View all {alerts.length} &rarr;
            </Link>
          </div>
          <div className="bg-white border rounded-lg divide-y">
            {topAlerts.map((a, i) => (
              <Link
                key={`${a.jobId}-${a.type}-${i}`}
                href={`/jobs/${a.jobId}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <div>
                  <div className="font-medium">{a.jobTitle}</div>
                  <div className="text-sm text-slate-500">{a.message}</div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${SEVERITY_CLASSES[a.severity]}`}>
                  {ALERT_TYPE_LABEL[a.type]}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Upcoming / recent jobs</h2>
          {canManageJobs(session.role) && (
            <Link href="/jobs/new" className="text-sm text-blue-600 hover:underline">
              + New job
            </Link>
          )}
        </div>
        {jobs.length === 0 ? (
          <p className="text-slate-500 text-sm">
            No jobs yet.
            {canManageJobs(session.role) && (
              <>
                {" "}
                <Link href="/jobs/new" className="text-blue-600 hover:underline">
                  Create the first one
                </Link>
                .
              </>
            )}
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
