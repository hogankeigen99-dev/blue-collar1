import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { markWorkerUnavailable, removeWorkerUnavailability } from "@/lib/availability-actions";
import { getSession } from "@/lib/session";
import { canManageJobs } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function WorkerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const now = new Date();
  const [worker, session, upcomingSchedule, unavailability] = await Promise.all([
    prisma.worker.findUnique({ where: { id } }),
    getSession(),
    prisma.scheduleAssignment.findMany({
      where: { workerId: id, date: { gte: now } },
      orderBy: { date: "asc" },
      take: 14,
      include: { job: { select: { id: true, title: true } } },
    }),
    prisma.workerUnavailability.findMany({
      where: { workerId: id, date: { gte: now } },
      orderBy: { date: "asc" },
    }),
  ]);
  if (!worker) notFound();

  const canEdit = session ? canManageJobs(session.role) : false;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/workers" className="text-sm text-blue-600 hover:underline">
          &larr; Workers
        </Link>
        <h1 className="text-2xl font-semibold mt-1">{worker.name}</h1>
        <p className="text-slate-500 text-sm mt-1">
          {[worker.role, worker.phone, worker.email].filter(Boolean).join(" · ") || "—"}
          {!worker.active && " · inactive"}
        </p>
      </div>

      <div className="bg-white border rounded-lg p-4 text-sm">
        <div className="text-slate-500">Labor rate</div>
        <div className="font-medium">{worker.laborRate ? `${formatMoney(worker.laborRate)}/hr` : "Not set"}</div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Upcoming schedule</h2>
        {upcomingSchedule.length === 0 ? (
          <p className="text-slate-500 text-sm">Nothing scheduled in the next 14 days.</p>
        ) : (
          <div className="bg-white border rounded-lg divide-y">
            {upcomingSchedule.map((sa) => (
              <div key={sa.id} className="px-4 py-2 flex items-center justify-between text-sm">
                <span>{formatDate(sa.date)}</span>
                <Link href={`/jobs/${sa.job.id}`} className="text-blue-600 hover:underline">
                  {sa.job.title}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Availability</h2>
        {unavailability.length === 0 ? (
          <p className="text-slate-500 text-sm">No unavailable dates on record.</p>
        ) : (
          <div className="bg-white border rounded-lg divide-y">
            {unavailability.map((u) => (
              <div key={u.id} className="px-4 py-2 flex items-center justify-between text-sm">
                <span>
                  {formatDate(u.date)} {u.reason && <span className="text-slate-500">— {u.reason}</span>}
                </span>
                {canEdit && (
                  <form action={removeWorkerUnavailability}>
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="workerId" value={worker.id} />
                    <button type="submit" className="text-red-600 hover:underline text-xs">
                      Remove
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <form action={markWorkerUnavailable} className="flex flex-wrap items-end gap-2 bg-white border rounded-lg p-4 text-sm">
            <input type="hidden" name="workerId" value={worker.id} />
            <div>
              <label className="block text-xs font-medium mb-1">Date</label>
              <input name="date" type="date" defaultValue={todayLocal()} required className="border rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Reason</label>
              <input name="reason" placeholder="PTO, sick, other job…" className="border rounded-md px-3 py-2 text-sm" />
            </div>
            <button type="submit" className="bg-slate-900 text-white px-3 py-2 rounded-md hover:bg-slate-700">
              Mark unavailable
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
