import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { submitDailyReport } from "@/lib/daily-report-actions";

function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function NewDailyReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [job, workers] = await Promise.all([
    prisma.job.findUnique({ where: { id } }),
    prisma.worker.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!job) notFound();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href={`/jobs/${job.id}/daily-reports`} className="text-sm text-blue-600 hover:underline">
          &larr; Daily reports
        </Link>
        <h1 className="text-2xl font-semibold mt-1">New daily report</h1>
        <p className="text-slate-500 text-sm mt-1">
          One per day — submitting again for the same date updates it. Only fill in what applies; everything but date is optional.
        </p>
      </div>

      <form
        action={submitDailyReport}
        encType="multipart/form-data"
        className="space-y-4 bg-white border rounded-lg p-6"
      >
        <input type="hidden" name="jobId" value={job.id} />

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <label className="block text-sm font-medium mb-1">Date *</label>
            <input name="date" type="date" defaultValue={todayLocal()} required className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Crew size</label>
            <input name="crewSize" type="number" step="1" min="0" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Hours</label>
            <input name="hours" type="number" step="any" min="0" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Work completed</label>
          <textarea name="workCompleted" rows={2} className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Photos</label>
          <input name="photos" type="file" accept="image/*" multiple className="w-full border rounded-md px-3 py-2 text-sm bg-white" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Material needed</label>
            <textarea name="materialNeeded" rows={2} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Equipment issue</label>
            <textarea name="equipmentIssue" rows={2} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Safety issue</label>
            <textarea name="safetyIssue" rows={2} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Delay reason</label>
            <textarea name="delayReason" rows={2} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="border rounded-md p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="hasChangeCondition" id="hasChangeCondition" />
            Change condition (unplanned extra work encountered)
          </label>
          <textarea
            name="changeConditionNotes"
            rows={2}
            placeholder="What changed and why it's extra work"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Tomorrow&apos;s plan</label>
          <textarea name="tomorrowPlan" rows={2} className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Submitted by</label>
          <select name="submittedById" className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="">— None —</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
          Submit report
        </button>
      </form>
    </div>
  );
}
