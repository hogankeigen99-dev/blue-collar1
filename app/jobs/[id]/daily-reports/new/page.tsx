import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { requireSession } from "@/lib/session";
import { submitDailyReport } from "@/lib/daily-report-actions";

function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function NewDailyReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;
  const { date: dateParam } = await searchParams;
  const [job, workers, jobCostCodes] = await Promise.all([
    prisma.job.findFirst({ where: { id } }),
    prisma.worker.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.jobCostCode.findMany({
      where: { jobId: id },
      include: { costCode: true },
      orderBy: { costCode: { code: "asc" } },
    }),
  ]);
  if (!job) notFound();

  const date = dateParam ?? todayLocal();
  // Prefill from today's report if one already exists — so re-opening this
  // page to add an afternoon update doesn't blank out the morning's entry.
  const [existing, existingEntries] = await Promise.all([
    prisma.dailyReport.findFirst({ where: { jobId: id, date: new Date(date) } }),
    prisma.productionEntry.findMany({ where: { dailyReport: { jobId: id, date: new Date(date) } } }),
  ]);
  const entryByJcc = new Map(existingEntries.map((e) => [e.jobCostCodeId, e]));

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <Link href={`/jobs/${job.id}`} className="text-sm text-blue-600 hover:underline">
          &larr; {job.title}
        </Link>
        <h1 className="text-2xl font-semibold mt-1">Daily update</h1>
        <p className="text-slate-500 text-sm mt-1">
          One form for the whole day — labor, materials, equipment, and any change work all update
          automatically from what you enter here. Submitting again for the same date updates it in place.
        </p>
      </div>

      <form
        action={submitDailyReport}
        encType="multipart/form-data"
        className="space-y-5 bg-white border rounded-lg p-5"
      >
        <input type="hidden" name="jobId" value={job.id} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Date *</label>
            <input name="date" type="date" defaultValue={date} required className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Crew size</label>
            <input
              name="crewSize"
              type="number"
              step="1"
              min="0"
              defaultValue={existing?.crewSize ?? ""}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="border-t pt-4">
          <label className="block text-sm font-medium mb-2">Labor &amp; production today</label>
          {jobCostCodes.length === 0 ? (
            <p className="text-sm text-slate-500">
              No cost code budgets on this job yet — a PM needs to{" "}
              <Link href={`/jobs/${job.id}/cost-codes/new`} className="text-blue-600 hover:underline">
                add one
              </Link>{" "}
              before hours can be logged against it.
            </p>
          ) : (
            <div className="space-y-2">
              {jobCostCodes.map((jcc) => {
                const entry = entryByJcc.get(jcc.id);
                return (
                  <div key={jcc.id} className="flex items-center gap-2">
                    <input type="hidden" name="rowJobCostCodeId" value={jcc.id} />
                    <div className="flex-1 text-sm">
                      <div className="font-medium">{jcc.costCode.code}</div>
                      <div className="text-xs text-slate-500">{jcc.costCode.description}</div>
                    </div>
                    <input
                      name="rowHours"
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Hrs"
                      defaultValue={entry?.hours ?? ""}
                      className="w-20 border rounded-md px-2 py-2 text-sm"
                      aria-label={`Hours for ${jcc.costCode.code}`}
                    />
                    <input
                      name="rowQty"
                      type="number"
                      step="any"
                      min="0"
                      placeholder={jcc.costCode.unit}
                      defaultValue={entry?.quantity ?? ""}
                      className="w-24 border rounded-md px-2 py-2 text-sm"
                      aria-label={`Quantity for ${jcc.costCode.code}`}
                    />
                  </div>
                );
              })}
              <p className="text-xs text-slate-500">
                Leave a code blank if nothing was worked on it today. This feeds job cost and productivity
                directly — nothing else to log.
              </p>
            </div>
          )}
        </div>

        <div className="border-t pt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Work completed</label>
            <textarea name="workCompleted" rows={2} defaultValue={existing?.workCompleted ?? ""} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Blockers</label>
            <textarea name="blockers" rows={2} placeholder="Anything stopping progress" defaultValue={existing?.blockers ?? ""} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Delay reason</label>
            <textarea name="delayReason" rows={2} defaultValue={existing?.delayReason ?? ""} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="border-t pt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Material needed</label>
            <textarea
              name="materialNeeded"
              rows={2}
              placeholder="e.g. 3 tons #4 rebar for section D"
              defaultValue={existing?.materialNeeded ?? ""}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">Opens a material request for the PM automatically.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Equipment issue</label>
            <textarea
              name="equipmentIssue"
              rows={2}
              defaultValue={existing?.equipmentIssue ?? ""}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">Shows up as a PM exception until it&apos;s cleared.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Safety issue</label>
            <textarea name="safetyIssue" rows={2} defaultValue={existing?.safetyIssue ?? ""} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="border-t pt-4 border rounded-md p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="hasChangeCondition" id="hasChangeCondition" defaultChecked={existing?.hasChangeCondition ?? false} />
            Change condition (unplanned extra work encountered)
          </label>
          <textarea
            name="changeConditionNotes"
            rows={2}
            placeholder="What changed and why it's extra work"
            defaultValue={existing?.changeConditionNotes ?? ""}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">Opens a pending change order for the PM to price automatically.</p>
        </div>

        <div className="border-t pt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Tomorrow&apos;s plan</label>
            <textarea name="tomorrowPlan" rows={2} defaultValue={existing?.tomorrowPlan ?? ""} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Photos</label>
            <input name="photos" type="file" accept="image/*" multiple className="w-full border rounded-md px-3 py-2 text-sm bg-white" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Submitted by</label>
            <select name="submittedById" defaultValue={existing?.submittedById ?? ""} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">— None —</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button type="submit" className="w-full bg-slate-900 text-white text-sm px-4 py-3 rounded-md hover:bg-slate-700">
          Submit daily update
        </button>
      </form>
    </div>
  );
}
