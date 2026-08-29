import Link from "next/link";
import { getResourceCommand } from "@/lib/resources";
import { requireSession } from "@/lib/session";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ResourceCommandPage() {
  const session = await requireSession();
  const r = await getResourceCommand(session.companyId);

  const jobsWithCrewToday = new Map<string, { jobId: string; jobTitle: string; jobNumber: string; workers: string[] }>();
  for (const a of r.crewAssignmentsToday) {
    const entry = jobsWithCrewToday.get(a.jobId) ?? { jobId: a.jobId, jobTitle: a.jobTitle, jobNumber: a.jobNumber, workers: [] };
    entry.workers.push(a.workerName);
    jobsWithCrewToday.set(a.jobId, entry);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Resource command</h1>
        <p className="text-slate-500 text-sm mt-1">
          Who&apos;s working where today, who&apos;s free, where the schedule and roster disagree, what&apos;s
          starting soon, and where every piece of equipment is right now.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Crews today ({jobsWithCrewToday.size} job(s))</h2>
          {jobsWithCrewToday.size === 0 ? (
            <p className="text-slate-500 text-sm bg-white border rounded-lg p-4">No crew scheduled today.</p>
          ) : (
            <div className="bg-white border rounded-lg divide-y">
              {Array.from(jobsWithCrewToday.values()).map((j) => (
                <Link key={j.jobId} href={`/jobs/${j.jobId}`} className="block px-4 py-3 hover:bg-slate-50">
                  <div className="font-medium text-sm">{j.jobTitle}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{j.jobNumber} · {j.workers.join(", ")}</div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-medium">
            Available today ({r.availableWorkersToday.length}) / Unavailable ({r.unavailableWorkersToday.length})
          </h2>
          <div className="bg-white border rounded-lg p-4 space-y-3 text-sm">
            {r.availableWorkersToday.length === 0 ? (
              <p className="text-slate-500">Everyone active is either scheduled or unavailable.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {r.availableWorkersToday.map((w) => (
                  <span key={w.workerId} className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                    {w.workerName}{w.role ? ` (${w.role})` : ""}
                  </span>
                ))}
              </div>
            )}
            {r.unavailableWorkersToday.length > 0 && (
              <div className="pt-2 border-t flex flex-wrap gap-1.5">
                {r.unavailableWorkersToday.map((w) => (
                  <span key={w.workerId} className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-500">
                    {w.workerName}{w.reason ? ` — ${w.reason}` : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {r.workerConflicts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-amber-700">
            Schedule/roster conflicts ({r.workerConflicts.length})
          </h2>
          <div className="bg-white border rounded-lg divide-y">
            {r.workerConflicts.map((c) => (
              <div key={c.workerId} className="px-4 py-3 text-sm">
                <span className="font-medium">{c.workerName}</span> is on today&apos;s schedule for{" "}
                {c.jobs.map((j, i) => (
                  <span key={j.jobId}>
                    {i > 0 && ", "}
                    <Link href={`/jobs/${j.jobId}`} className="text-blue-600 hover:underline">
                      {j.jobTitle}
                    </Link>
                  </span>
                ))}{" "}
                without a formal crew assignment there —{" "}
                <Link href="/schedule" className="text-blue-600 hover:underline">
                  reconcile on the schedule board
                </Link>
                .
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Starting soon, still staffing</h2>
        {r.upcomingStarts.length === 0 ? (
          <p className="text-slate-500 text-sm bg-white border rounded-lg p-4">
            Nothing in preconstruction or mobilization starts in the next two weeks.
          </p>
        ) : (
          <div className="bg-white border rounded-lg divide-y">
            {r.upcomingStarts.map((u) => (
              <Link key={u.jobId} href={`/jobs/${u.jobId}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                <div>
                  <div className="font-medium text-sm">{u.jobTitle}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {u.jobNumber} · Starts {formatDate(u.targetStartDate)} · Foreman: {u.foremanName ?? "unassigned"}
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${u.crewAssignedCount === 0 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                  {u.crewAssignedCount === 0 ? "No crew assigned" : `${u.crewAssignedCount} on roster`}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Equipment out ({r.equipmentOut.length})</h2>
          {r.equipmentOut.length === 0 ? (
            <p className="text-slate-500 text-sm bg-white border rounded-lg p-4">Nothing currently out.</p>
          ) : (
            <div className="bg-white border rounded-lg divide-y">
              {r.equipmentOut.map((e) => (
                <Link key={`${e.equipmentId}-${e.jobId}`} href={`/jobs/${e.jobId}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                  <div>
                    <div className="font-medium text-sm">{e.name}{e.type ? ` (${e.type})` : ""}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{e.jobTitle} · due {formatDate(e.endDate)}</div>
                  </div>
                  {e.status === "overdue_return" && (
                    <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 whitespace-nowrap">Overdue return</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Equipment available ({r.equipmentAvailable.length})</h2>
          {r.equipmentAvailable.length === 0 ? (
            <p className="text-slate-500 text-sm bg-white border rounded-lg p-4">Nothing free right now.</p>
          ) : (
            <div className="bg-white border rounded-lg p-4 flex flex-wrap gap-1.5">
              {r.equipmentAvailable.map((e) => (
                <span key={e.equipmentId} className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                  {e.name}{e.type ? ` (${e.type})` : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
