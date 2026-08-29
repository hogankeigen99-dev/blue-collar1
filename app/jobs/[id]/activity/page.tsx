import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function JobActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [job, entries] = await Promise.all([
    prisma.job.findUnique({ where: { id } }),
    prisma.auditLog.findMany({ where: { jobId: id }, orderBy: { createdAt: "desc" } }),
  ]);
  if (!job) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/jobs/${job.id}`} className="text-sm text-blue-600 hover:underline">
          &larr; {job.title}
        </Link>
        <h1 className="text-2xl font-semibold mt-1">Activity</h1>
        <p className="text-slate-500 text-sm mt-1">
          An audit trail of significant changes on this job — stage moves, approvals, and
          status changes that affect cost or billing.
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="text-slate-500 text-sm">No recorded activity yet.</p>
      ) : (
        <div className="bg-white border rounded-lg divide-y">
          {entries.map((e) => (
            <div key={e.id} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{e.action}</span>
                <span className="text-xs text-slate-400">{new Date(e.createdAt).toLocaleString()}</span>
              </div>
              <div className="text-slate-500 text-xs mt-0.5">
                {e.userName} ({e.userRole}){e.detail ? ` · ${e.detail}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
