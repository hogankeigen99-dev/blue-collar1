import Link from "next/link";
import { getFieldActivityFeed, getForemanToday } from "@/lib/field-activity";
import { requireSession } from "@/lib/session";
import { scopedPrisma } from "@/lib/tenant";
import { formatDate, PROJECT_STAGE_LABEL } from "@/lib/format";
import { PRODUCTIVITY_STATUS_LABEL, PRODUCTIVITY_STATUS_CLASSES } from "@/lib/productivity";

export const dynamic = "force-dynamic";

function FlagBadge({ label, tone }: { label: string; tone: "amber" | "red" }) {
  const cls = tone === "red" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";
  return <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${cls}`}>{label}</span>;
}

async function ForemanHome({ companyId, userId }: { companyId: string; userId: string }) {
  const today = await getForemanToday(companyId, userId);

  if (!today.workerId) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="text-slate-500 text-sm mt-2">
          Your login isn&apos;t linked to a crew record yet, so there&apos;s no personal assignment to show — ask
          an admin to link your account to your worker profile. In the meantime,{" "}
          <Link href="/jobs" className="text-blue-600 hover:underline">
            browse all jobs
          </Link>
          .
        </p>
      </div>
    );
  }

  if (today.jobs.length === 0) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="text-slate-500 text-sm mt-2">Hi {today.workerName} — you&apos;re not assigned to any active job right now.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Today — {today.workerName}</h1>
        <p className="text-slate-500 text-sm mt-1">Your assigned project(s), crew, work plan, and quick actions.</p>
      </div>
      {today.jobs.map((job) => (
        <div key={job.jobId} className="bg-white border rounded-lg p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link href={`/jobs/${job.jobId}`} className="font-semibold hover:underline">
                {job.jobTitle}
              </Link>
              <div className="text-xs text-slate-500 mt-0.5">
                {job.jobNumber} · {PROJECT_STAGE_LABEL[job.stage] ?? job.stage}
              </div>
            </div>
            {job.reportSubmittedToday ? (
              <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 whitespace-nowrap">Today&apos;s report in</span>
            ) : (
              <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">Report due</span>
            )}
          </div>

          {job.crewToday.length > 0 && (
            <div className="text-sm">
              <span className="text-slate-500">Crew today: </span>
              {job.crewToday.join(", ")}
            </div>
          )}

          {job.yesterdaysPlan && (
            <div className="text-sm bg-slate-50 rounded-md p-3">
              <span className="text-slate-500">Yesterday&apos;s plan for today: </span>
              {job.yesterdaysPlan}
            </div>
          )}

          {job.costCodes.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Work plan</div>
              <div className="divide-y border rounded-md">
                {job.costCodes.map((cc) => (
                  <div key={cc.costCodeId} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium">{cc.code} — {cc.description}</div>
                      <div className="text-xs text-slate-400">
                        {cc.actualQty}/{cc.estimatedQty} {cc.unit} · {cc.actualHours}/{cc.estimatedHours} hrs
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${PRODUCTIVITY_STATUS_CLASSES[cc.status]}`}>
                      {PRODUCTIVITY_STATUS_LABEL[cc.status]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Link href={`/jobs/${job.jobId}/daily-reports/new`} className="bg-slate-900 text-white text-xs px-3 py-2 rounded-md hover:bg-slate-700">
              Daily update →
            </Link>
            <Link href={`/jobs/${job.jobId}/materials`} className="border text-xs px-3 py-2 rounded-md hover:bg-slate-50">
              Materials
            </Link>
            <Link href={`/jobs/${job.jobId}/change-orders`} className="border text-xs px-3 py-2 rounded-md hover:bg-slate-50">
              Change orders
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

async function FieldActivityFeed({ companyId, jobId }: { companyId: string; jobId?: string }) {
  const prisma = scopedPrisma(companyId);
  const [reports, jobs] = await Promise.all([
    getFieldActivityFeed(companyId, { jobId, days: 14 }),
    prisma.job.findMany({ where: { status: { not: "CANCELLED" } }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Field activity</h1>
          <p className="text-slate-500 text-sm mt-1">
            Every daily report across the company, last 14 days — blockers, material needs, equipment issues, and
            change conditions surfaced without opening each job.
          </p>
        </div>
        <form method="GET" className="flex items-center gap-2">
          <select name="jobId" defaultValue={jobId ?? ""} className="border rounded-md px-2 py-1.5 text-sm">
            <option value="">All jobs</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.title}</option>
            ))}
          </select>
          <button type="submit" className="text-sm border rounded-md px-3 py-1.5 hover:bg-slate-50">
            Filter
          </button>
        </form>
      </div>

      {reports.length === 0 ? (
        <p className="text-slate-500 text-sm bg-white border rounded-lg p-6">No daily reports in this window.</p>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <Link key={r.id} href={`/jobs/${r.jobId}/daily-reports/${r.id}`} className="block bg-white border rounded-lg p-4 hover:border-slate-400">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-sm">{r.jobTitle}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {formatDate(r.date)} · {r.jobNumber} · {r.submittedByName ?? "Unknown"}
                    {r.crewSize ? ` · crew of ${r.crewSize}` : ""}
                    {r.hours ? ` · ${r.hours} hrs` : ""}
                  </div>
                  {r.workCompleted && <p className="text-sm mt-1.5">{r.workCompleted}</p>}
                </div>
                <div className="flex flex-col gap-1 items-end flex-shrink-0">
                  {r.safetyIssue && <FlagBadge label="Safety" tone="red" />}
                  {r.blockers && <FlagBadge label="Blocker" tone="red" />}
                  {r.equipmentIssue && <FlagBadge label="Equipment" tone="amber" />}
                  {r.materialNeeded && <FlagBadge label="Material" tone="amber" />}
                  {r.hasChangeCondition && <FlagBadge label="Change condition" tone="amber" />}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function FieldPage({ searchParams }: { searchParams: Promise<{ jobId?: string }> }) {
  const session = await requireSession();
  const { jobId } = await searchParams;

  if (session.role === "FOREMAN") {
    return <ForemanHome companyId={session.companyId} userId={session.userId} />;
  }
  return <FieldActivityFeed companyId={session.companyId} jobId={jobId} />;
}
