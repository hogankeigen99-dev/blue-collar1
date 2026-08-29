import Link from "next/link";
import { scopedPrisma } from "@/lib/tenant";
import { requireSession } from "@/lib/session";
import { canManageJobs } from "@/lib/auth";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export default async function JobsPage() {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: "desc" },
    include: { customer: true, assignments: { include: { worker: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        {session && canManageJobs(session.role) && (
          <Link
            href="/jobs/new"
            className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
          >
            + New job
          </Link>
        )}
      </div>

      {jobs.length === 0 ? (
        <p className="text-slate-500 text-sm">No jobs yet.</p>
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
  );
}
