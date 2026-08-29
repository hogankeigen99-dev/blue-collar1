import Link from "next/link";
import { scopedPrisma } from "@/lib/tenant";
import { requirePageRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CompanyActivityPage() {
  const session = await requirePageRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);

  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // AuditLog.jobId isn't a Prisma relation (just a plain string column) —
  // batch-fetch the titles for whatever job ids showed up instead of
  // querying per row.
  const jobIds = [...new Set(entries.map((e) => e.jobId).filter((id): id is string => id !== null))];
  const jobs = jobIds.length > 0 ? await prisma.job.findMany({ where: { id: { in: jobIds } }, select: { id: true, title: true } }) : [];
  const jobTitleById = Object.fromEntries(jobs.map((j) => [j.id, j.title]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Company activity</h1>
        <p className="text-slate-500 text-sm mt-1">
          Every audited action across the company — money (invoices, GL mappings, budgets,
          subcontractor costs, material POs), status/approval changes, and security-relevant
          changes (users, API keys, webhooks, SSO, integration credentials). A job&apos;s own
          activity is also visible at{" "}
          <span className="font-mono text-xs bg-slate-100 px-1 rounded">/jobs/[id]/activity</span>.
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="text-slate-500 text-sm">No recorded activity yet.</p>
      ) : (
        <div className="bg-white border rounded-lg divide-y">
          {entries.map((e) => (
            <div key={e.id} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{e.action}</span>
                <span className="text-xs text-slate-400 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</span>
              </div>
              <div className="text-slate-500 text-xs mt-0.5">
                {e.userName} ({e.userRole}){e.detail ? ` · ${e.detail}` : ""}
                {e.jobId && jobTitleById[e.jobId] && (
                  <>
                    {" · "}
                    <Link href={`/jobs/${e.jobId}`} className="text-blue-600 hover:underline">
                      {jobTitleById[e.jobId]}
                    </Link>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
