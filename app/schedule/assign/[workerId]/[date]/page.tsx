import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { setScheduleAssignment } from "@/lib/schedule-actions";
import { requirePageRole } from "@/lib/session";
import { dateKey, parseDateKey } from "@/lib/schedule";

export default async function AssignSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ workerId: string; date: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  await requirePageRole("ADMIN", "PM");
  const { workerId, date } = await params;
  const { week } = await searchParams;

  const [worker, jobs, existing] = await Promise.all([
    prisma.worker.findUnique({ where: { id: workerId } }),
    prisma.job.findMany({
      where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      orderBy: { title: "asc" },
    }),
    prisma.scheduleAssignment.findUnique({
      where: { workerId_date: { workerId, date: parseDateKey(date) } },
    }),
  ]);

  if (!worker) notFound();

  const scheduleHref = week ? `/schedule?week=${week}` : "/schedule";

  return (
    <div className="max-w-md space-y-6">
      <div>
        <Link href={scheduleHref} className="text-sm text-blue-600 hover:underline">
          &larr; Back to schedule
        </Link>
        <h1 className="text-2xl font-semibold mt-1">
          {worker.name} — {new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" })}
        </h1>
      </div>

      <form action={setScheduleAssignment} className="space-y-4 bg-white border rounded-lg p-6">
        <input type="hidden" name="workerId" value={worker.id} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="week" value={week ?? dateKey(new Date())} />

        <div>
          <label className="block text-sm font-medium mb-1">Job</label>
          <select
            name="jobId"
            defaultValue={existing?.jobId ?? ""}
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="">— Unassigned —</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
        >
          Save
        </button>
      </form>
    </div>
  );
}
