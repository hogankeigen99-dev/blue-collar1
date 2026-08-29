import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { canManageJobs } from "@/lib/auth";
import { addDays, dateKey, formatDayHeader, jobColorClass, startOfWeek, weekDates } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await requireSession();
  const { week } = await searchParams;

  const monday = startOfWeek(week ? new Date(`${week}T00:00:00.000Z`) : new Date());
  const days = weekDates(monday);
  const rangeEnd = addDays(monday, 7);

  const [workers, jobs, assignments] = await Promise.all([
    prisma.worker.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.job.findMany({
      where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      orderBy: { title: "asc" },
    }),
    prisma.scheduleAssignment.findMany({
      where: { date: { gte: monday, lt: rangeEnd } },
      include: { job: { select: { id: true, title: true } } },
    }),
  ]);

  const byWorkerAndDate = new Map<string, (typeof assignments)[number]>();
  for (const a of assignments) {
    byWorkerAndDate.set(`${a.workerId}:${dateKey(a.date)}`, a);
  }

  const prevWeek = dateKey(addDays(monday, -7));
  const nextWeek = dateKey(addDays(monday, 7));
  const canEdit = canManageJobs(session.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Crew schedule</h1>
          <p className="text-slate-500 text-sm mt-1">
            Who&apos;s on which job, day by day — one crew can&apos;t be double-booked.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/schedule?week=${prevWeek}`} className="text-blue-600 hover:underline">
            &larr; Prev week
          </Link>
          <Link href="/schedule" className="text-blue-600 hover:underline">
            This week
          </Link>
          <Link href={`/schedule?week=${nextWeek}`} className="text-blue-600 hover:underline">
            Next week &rarr;
          </Link>
        </div>
      </div>

      {workers.length === 0 ? (
        <p className="text-slate-500 text-sm">No active workers yet.</p>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-4 py-3 font-medium sticky left-0 bg-white">Worker</th>
                {days.map((d) => (
                  <th key={dateKey(d)} className="px-3 py-3 font-medium whitespace-nowrap">
                    {formatDayHeader(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {workers.map((w) => (
                <tr key={w.id}>
                  <td className="px-4 py-2 font-medium whitespace-nowrap sticky left-0 bg-white">
                    {w.name}
                    {w.role && <div className="text-xs text-slate-400 font-normal">{w.role}</div>}
                  </td>
                  {days.map((d) => {
                    const key = dateKey(d);
                    const assignment = byWorkerAndDate.get(`${w.id}:${key}`);
                    const cellContent = assignment ? (
                      <span
                        className={`inline-block text-xs px-2 py-1 rounded-full ${jobColorClass(assignment.jobId)}`}
                      >
                        {assignment.job.title}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    );
                    return (
                      <td key={key} className="px-3 py-2">
                        {canEdit ? (
                          <Link
                            href={`/schedule/assign/${w.id}/${key}?week=${dateKey(monday)}`}
                            className="block hover:opacity-75"
                          >
                            {cellContent}
                          </Link>
                        ) : (
                          cellContent
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {jobs.length === 0 && (
        <p className="text-slate-500 text-sm">
          No scheduled or in-progress jobs to assign crews to yet.
        </p>
      )}
    </div>
  );
}
