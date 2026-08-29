import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateJobStatus, deleteJob } from "@/lib/actions";
import { computeProgress, PRODUCTIVITY_STATUS_LABEL, PRODUCTIVITY_STATUS_CLASSES } from "@/lib/productivity";
import { requireSession } from "@/lib/session";
import { canManageJobs, canManageEstimates } from "@/lib/auth";
import { getJobCosting } from "@/lib/job-costing";
import { getBillingReadiness } from "@/lib/billing";
import { formatMoney, formatDate, PROJECT_STAGE_LABEL, COST_CATEGORY_LABEL } from "@/lib/format";
import { setJobBudget } from "@/lib/command-center-actions";
import { createSubcontractorCost, updateSubcontractorCost } from "@/lib/subcontractor-actions";
import { toggleChecklistItem, addChecklistItem } from "@/lib/checklist-actions";

const STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
const BUDGET_CATEGORIES = ["LABOR", "MATERIAL", "EQUIPMENT", "SUBCONTRACTOR", "OTHER"] as const;
const STAGES = ["PRECON", "MOBILIZATION", "ACTIVE", "PUNCH_LIST", "CLOSEOUT", "COMPLETE"] as const;

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ imported?: string; skipped?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const { imported, skipped } = await searchParams;
  const [job, jobCostCodes, costing, billing] = await Promise.all([
    prisma.job.findUnique({
      where: { id },
      include: { customer: true, assignments: { include: { worker: true } }, pm: true, foreman: true },
    }),
    prisma.jobCostCode.findMany({
      where: { jobId: id },
      include: { costCode: true, entries: { orderBy: { date: "desc" } } },
      orderBy: { costCode: { code: "asc" } },
    }),
    getJobCosting(id),
    getBillingReadiness(id),
  ]);
  const [subcontractorCosts, checklistItems] = await Promise.all([
    prisma.subcontractorCost.findMany({ where: { jobId: id }, orderBy: { createdAt: "desc" } }),
    prisma.jobChecklistItem.findMany({ where: { jobId: id }, orderBy: { createdAt: "asc" } }),
  ]);

  if (!job) notFound();

  const canManage = canManageJobs(session.role);
  const canEstimate = canManageEstimates(session.role);

  const totalEstQty = jobCostCodes.reduce((s, j) => s + j.estimatedQty, 0);
  const totalActQty = jobCostCodes.reduce(
    (s, j) => s + computeProgress(j.estimatedQty, j.estimatedHours, j.entries).actualQty,
    0
  );
  const scheduleProgressPct = totalEstQty > 0 ? Math.min(1, totalActQty / totalEstQty) : null;

  async function setStatus(formData: FormData) {
    "use server";
    const status = formData.get("status");
    if (typeof status === "string") {
      await updateJobStatus(job!.id, status);
    }
  }

  async function removeJob() {
    "use server";
    await deleteJob(job!.id);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{job.title}</h1>
          {job.customer && (
            <p className="text-slate-500 text-sm mt-1">For {job.customer.name}</p>
          )}
        </div>
        {canManage && (
          <Link href={`/jobs/${job.id}/command-center/edit`} className="text-sm text-blue-600 hover:underline">
            Edit command center
          </Link>
        )}
      </div>

      {imported !== undefined && (
        <div className="max-w-2xl text-sm bg-green-50 border border-green-200 text-green-800 rounded-md px-4 py-3">
          Imported {imported} budget line{imported === "1" ? "" : "s"}.
          {skipped && (
            <span className="block mt-1 text-amber-700">
              Skipped (unmatched code or invalid numbers): {skipped}
            </span>
          )}
        </div>
      )}

      {/* Command Center summary */}
      <div className="bg-white border rounded-lg p-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-slate-500">Stage</div>
          <div className="font-medium">{PROJECT_STAGE_LABEL[job.stage]}</div>
        </div>
        <div>
          <div className="text-slate-500">Contract value</div>
          <div className="font-medium">{formatMoney(costing.contractValue)}</div>
        </div>
        <div>
          <div className="text-slate-500">PM</div>
          <div className="font-medium">{job.pm?.name ?? "—"}</div>
        </div>
        <div>
          <div className="text-slate-500">Foreman</div>
          <div className="font-medium">{job.foreman?.name ?? "—"}</div>
        </div>
        <div>
          <div className="text-slate-500">Target start</div>
          <div className="font-medium">{formatDate(job.targetStartDate)}</div>
        </div>
        <div>
          <div className="text-slate-500">Target finish</div>
          <div className="font-medium">{formatDate(job.targetEndDate)}</div>
        </div>
        <div>
          <div className="text-slate-500">Schedule progress</div>
          <div className="font-medium">
            {scheduleProgressPct !== null ? `${(scheduleProgressPct * 100).toFixed(0)}%` : "—"}
          </div>
        </div>
        <div>
          <div className="text-slate-500">Billed to date</div>
          <div className="font-medium">{formatMoney(costing.billedAmount)}</div>
        </div>
      </div>

      {/* Sub-workflow links */}
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href={`/jobs/${job.id}/daily-reports`} className="bg-white border rounded-md px-3 py-1.5 hover:bg-slate-50">
          Daily reports
        </Link>
        <Link href={`/jobs/${job.id}/materials`} className="bg-white border rounded-md px-3 py-1.5 hover:bg-slate-50">
          Materials
        </Link>
        <Link href={`/jobs/${job.id}/change-orders`} className="bg-white border rounded-md px-3 py-1.5 hover:bg-slate-50">
          Change orders
        </Link>
        <Link href="/equipment" className="bg-white border rounded-md px-3 py-1.5 hover:bg-slate-50">
          Equipment
        </Link>
        <Link href={`/jobs/${job.id}/invoices`} className="bg-white border rounded-md px-3 py-1.5 hover:bg-slate-50">
          Invoices
        </Link>
        <Link href={`/jobs/${job.id}/documents`} className="bg-white border rounded-md px-3 py-1.5 hover:bg-slate-50">
          Documents
        </Link>
        <Link href={`/jobs/${job.id}/activity`} className="bg-white border rounded-md px-3 py-1.5 hover:bg-slate-50">
          Activity
        </Link>
        {canEstimate && (
          <a
            href={`/api/jobs/${job.id}/accounting-export`}
            className="bg-white border rounded-md px-3 py-1.5 hover:bg-slate-50"
          >
            Export to accounting (CSV)
          </a>
        )}
      </div>

      {/* Checklist — automation-generated on stage entry, plus manual items */}
      <div className="space-y-3">
        <h2 className="text-lg font-medium">Checklist</h2>
          {checklistItems.length === 0 ? (
            <p className="text-slate-500 text-sm">No checklist items yet.</p>
          ) : (
            <div className="bg-white border rounded-lg divide-y">
              {checklistItems.map((item) => (
                <form
                  key={item.id}
                  action={toggleChecklistItem}
                  className="px-4 py-2 flex items-center gap-3 text-sm"
                >
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="jobId" value={job.id} />
                  <input type="hidden" name="done" value={item.done ? "" : "on"} />
                  <button
                    type="submit"
                    className={`w-4 h-4 rounded border flex-shrink-0 ${item.done ? "bg-slate-900 border-slate-900" : "border-slate-300"}`}
                    aria-label={item.done ? "Mark not done" : "Mark done"}
                  />
                  <span className={item.done ? "line-through text-slate-400" : ""}>{item.title}</span>
                  <span className="ml-auto text-xs text-slate-400">
                    {PROJECT_STAGE_LABEL[item.stage]} · {item.source === "AUTOMATED" ? "auto" : "manual"}
                  </span>
                </form>
              ))}
            </div>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700">+ Add checklist item</summary>
            <form action={addChecklistItem} className="mt-2 flex flex-wrap items-end gap-2 bg-white border rounded-lg p-4">
              <input type="hidden" name="jobId" value={job.id} />
              <div>
                <label className="block text-xs font-medium mb-1">Stage</label>
                <select name="stage" defaultValue={job.stage} className="border rounded-md px-2 py-1 text-sm">
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {PROJECT_STAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium mb-1">Title</label>
                <input name="title" required className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <button type="submit" className="bg-slate-900 text-white text-sm px-3 py-2 rounded-md hover:bg-slate-700">
                Add
              </button>
            </form>
          </details>
      </div>

      {/* Job costing */}
      <div className="space-y-3">
        <h2 className="text-lg font-medium">Job costing</h2>
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium text-right">Estimated</th>
                <th className="px-4 py-3 font-medium text-right">Committed</th>
                <th className="px-4 py-3 font-medium text-right">Actual</th>
                <th className="px-4 py-3 font-medium text-right">Projected</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {costing.categories.map((c) => (
                <tr key={c.category}>
                  <td className="px-4 py-3 font-medium">{COST_CATEGORY_LABEL[c.category]}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(c.estimated)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(c.committed)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(c.actual)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(c.projected)}</td>
                </tr>
              ))}
              <tr className="font-medium bg-slate-50">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">{formatMoney(costing.totalEstimated)}</td>
                <td className="px-4 py-3 text-right">{formatMoney(costing.totalCommitted)}</td>
                <td className="px-4 py-3 text-right">{formatMoney(costing.totalActual)}</td>
                <td className="px-4 py-3 text-right">{formatMoney(costing.totalProjected)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-white border rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-slate-500">Change order revenue</div>
            <div className="font-medium">{formatMoney(costing.changeOrderRevenue)}</div>
          </div>
          <div>
            <div className="text-slate-500">Projected final cost</div>
            <div className="font-medium">{formatMoney(costing.projectedFinalCost)}</div>
          </div>
          <div>
            <div className="text-slate-500">Projected gross profit</div>
            <div className={`font-medium ${costing.projectedGrossProfit < 0 ? "text-red-600" : ""}`}>
              {formatMoney(costing.projectedGrossProfit)}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Projected margin</div>
            <div className={`font-medium ${(costing.projectedMarginPct ?? 1) < 0.1 ? "text-red-600" : ""}`}>
              {costing.projectedMarginPct !== null ? `${(costing.projectedMarginPct * 100).toFixed(1)}%` : "—"}
            </div>
          </div>
        </div>

        {canEstimate && (
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700">Set a category budget</summary>
            <form action={setJobBudget} className="mt-2 flex flex-wrap items-end gap-3 bg-white border rounded-lg p-4">
              <input type="hidden" name="jobId" value={job.id} />
              <div>
                <label className="block text-xs font-medium mb-1">Category</label>
                <select name="category" className="border rounded-md px-3 py-2 text-sm">
                  {BUDGET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {COST_CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Estimated amount</label>
                <input name="estimatedAmount" type="number" step="any" min="0" required className="border rounded-md px-3 py-2 text-sm" />
              </div>
              <button type="submit" className="bg-slate-900 text-white text-sm px-3 py-2 rounded-md hover:bg-slate-700">
                Save budget
              </button>
            </form>
          </details>
        )}
      </div>

      {/* Billing readiness */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium">Billing readiness</h2>
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              billing.ready ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {billing.ready ? "Ready to invoice" : "Not ready"}
          </span>
        </div>
        <div className="bg-white border rounded-lg divide-y">
          {billing.checks.map((c) => (
            <div key={c.key} className="px-4 py-3 flex items-center justify-between text-sm">
              <div>
                <div className="font-medium">{c.label}</div>
                <div className="text-slate-500 text-xs">{c.detail}</div>
              </div>
              <span className={c.ok ? "text-green-600" : "text-red-600"}>{c.ok ? "✓" : "✗"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Subcontractors */}
      <div className="space-y-3">
        <h2 className="text-lg font-medium">Subcontractors</h2>
        {subcontractorCosts.length === 0 ? (
          <p className="text-slate-500 text-sm">No subcontractor costs recorded yet.</p>
        ) : (
          <div className="bg-white border rounded-lg divide-y">
            {subcontractorCosts.map((s) => (
              <div key={s.id} className="px-4 py-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{s.vendor}</div>
                  <div className="text-slate-500 text-xs">
                    {s.description ?? "—"} · Committed {formatMoney(s.committedAmount)} · Actual {formatMoney(s.actualAmount)}
                  </div>
                </div>
                {canEstimate ? (
                  <form action={updateSubcontractorCost} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="jobId" value={job.id} />
                    <select name="status" defaultValue={s.status} className="border rounded-md px-2 py-1 text-xs">
                      <option value="COMMITTED">Committed</option>
                      <option value="INVOICED">Invoiced</option>
                      <option value="PAID">Paid</option>
                    </select>
                    <input
                      name="actualAmount"
                      type="number"
                      step="any"
                      min="0"
                      defaultValue={s.actualAmount}
                      className="w-24 border rounded-md px-2 py-1 text-xs"
                    />
                    <button type="submit" className="bg-slate-900 text-white text-xs px-2 py-1 rounded-md hover:bg-slate-700">
                      Save
                    </button>
                  </form>
                ) : (
                  <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">{s.status}</span>
                )}
              </div>
            ))}
          </div>
        )}
        {canEstimate && (
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700">+ Add subcontractor cost</summary>
            <form action={createSubcontractorCost} className="mt-2 space-y-3 bg-white border rounded-lg p-4">
              <input type="hidden" name="jobId" value={job.id} />
              <div>
                <label className="block text-xs font-medium mb-1">Vendor *</label>
                <input name="vendor" required className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Description</label>
                <input name="description" className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Committed amount *</label>
                <input name="committedAmount" type="number" step="any" min="0" required className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <button type="submit" className="bg-slate-900 text-white text-sm px-3 py-2 rounded-md hover:bg-slate-700">
                Add
              </button>
            </form>
          </details>
        )}
      </div>

      <div className="max-w-2xl bg-white border rounded-lg p-6 space-y-4">
        {job.description && (
          <div>
            <div className="text-sm font-medium text-slate-500">Description</div>
            <p className="text-sm">{job.description}</p>
          </div>
        )}
        {job.address && (
          <div>
            <div className="text-sm font-medium text-slate-500">Address</div>
            <p className="text-sm">{job.address}</p>
          </div>
        )}
        {job.scheduledAt && (
          <div>
            <div className="text-sm font-medium text-slate-500">Scheduled</div>
            <p className="text-sm">{new Date(job.scheduledAt).toLocaleString()}</p>
          </div>
        )}
        <div>
          <div className="text-sm font-medium text-slate-500">Assigned workers</div>
          {job.assignments.length === 0 ? (
            <p className="text-sm text-slate-500">None assigned</p>
          ) : (
            <ul className="text-sm list-disc list-inside">
              {job.assignments.map((a) => (
                <li key={a.id}>
                  {a.worker.name} {a.worker.role && `(${a.worker.role})`}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="text-sm font-medium text-slate-500 mb-1">Status</div>
          <form action={setStatus} className="flex items-center gap-2">
            <select
              name="status"
              defaultValue={job.status}
              className="border rounded-md px-3 py-2 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="bg-slate-900 text-white text-sm px-3 py-2 rounded-md hover:bg-slate-700"
            >
              Update
            </button>
          </form>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Labor productivity</h2>
          <div className="flex gap-3 text-sm">
            {canEstimate && (
              <>
                <Link href={`/jobs/${job.id}/cost-codes/new`} className="text-blue-600 hover:underline">
                  + Add budget line
                </Link>
                <Link href={`/jobs/${job.id}/cost-codes/import`} className="text-blue-600 hover:underline">
                  Import CSV
                </Link>
              </>
            )}
            <Link href={`/jobs/${job.id}/log`} className="text-blue-600 hover:underline">
              + Log production
            </Link>
          </div>
        </div>

        {jobCostCodes.length === 0 ? (
          <p className="text-slate-500 text-sm">
            No cost code budgets yet. Add one to start tracking actual vs. estimated
            productivity for this job.
          </p>
        ) : (
          <div className="bg-white border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="px-4 py-3 font-medium">Cost code</th>
                  <th className="px-4 py-3 font-medium text-right">Est qty</th>
                  <th className="px-4 py-3 font-medium text-right">Actual qty</th>
                  <th className="px-4 py-3 font-medium text-right">Est hrs</th>
                  <th className="px-4 py-3 font-medium text-right">Actual hrs</th>
                  <th className="px-4 py-3 font-medium text-right">Est rate</th>
                  <th className="px-4 py-3 font-medium text-right">Actual rate</th>
                  <th className="px-4 py-3 font-medium text-right">Variance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {jobCostCodes.map((jcc) => {
                  const progress = computeProgress(jcc.estimatedQty, jcc.estimatedHours, jcc.entries);
                  return (
                    <tr key={jcc.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium">{jcc.costCode.code}</div>
                        <div className="text-slate-500 text-xs">
                          {jcc.costCode.description} ({jcc.costCode.unit})
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">{jcc.estimatedQty}</td>
                      <td className="px-4 py-3 text-right">{progress.actualQty || "—"}</td>
                      <td className="px-4 py-3 text-right">{jcc.estimatedHours}</td>
                      <td className="px-4 py-3 text-right">{progress.actualHours || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        {progress.estimatedRate !== null ? progress.estimatedRate.toFixed(2) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {progress.actualRate !== null ? progress.actualRate.toFixed(2) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {progress.hoursVariancePct !== null
                          ? `${progress.hoursVariancePct >= 0 ? "+" : ""}${(
                              progress.hoursVariancePct * 100
                            ).toFixed(0)}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${PRODUCTIVITY_STATUS_CLASSES[progress.status]}`}
                        >
                          {PRODUCTIVITY_STATUS_LABEL[progress.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {jobCostCodes.some((jcc) => jcc.entries.length > 0) && (
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
              Daily production log
            </summary>
            <div className="bg-white border rounded-lg divide-y mt-2">
              {jobCostCodes
                .flatMap((jcc) =>
                  jcc.entries.map((e) => ({ ...e, costCode: jcc.costCode }))
                )
                .sort((a, b) => b.date.getTime() - a.date.getTime())
                .map((e) => (
                  <div key={e.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">
                        {e.costCode.code} — {new Date(e.date).toLocaleDateString()}
                      </div>
                      <div className="text-slate-500 text-xs">
                        {e.hours} hrs · {e.quantity} {e.costCode.unit}
                        {e.crewSize ? ` · crew of ${e.crewSize}` : ""}
                        {e.notes ? ` · ${e.notes}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </details>
        )}
      </div>

      {canManage && (
        <form action={removeJob}>
          <button
            type="submit"
            className="text-sm text-red-600 hover:underline"
          >
            Delete job
          </button>
        </form>
      )}
    </div>
  );
}
