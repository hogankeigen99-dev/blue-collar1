import Link from "next/link";
import { requireSession } from "@/lib/session";
import { canManageJobs, canManageEstimates } from "@/lib/auth";
import { scopedPrisma } from "@/lib/tenant";
import { resolveCockpitIdentity, NORTHPOINT_TITLE } from "@/lib/small-project-cockpit";
import { getProjectHealth } from "@/lib/project-health";
import { getContract } from "@/lib/contract";
import { getDailyCommand } from "@/lib/pm-daily-command";
import { getCostCodeRates, getAllCostCodeRatesMap } from "@/lib/productivity-benchmarks";
import { computeProgress } from "@/lib/productivity";
import { formatMoney, formatDate, PROJECT_STAGE_LABEL, COST_CATEGORY_LABEL } from "@/lib/format";
import { ALERT_TYPE_LABEL } from "@/lib/alerts";
import { DEMO_PERSONAS } from "@/lib/demo-personas";
import { switchDemoRole } from "@/lib/demo-actions";
import { awardProject } from "@/lib/award-actions";
import { assignCrewToJob } from "@/lib/schedule-actions";
import { submitDailyReport } from "@/lib/daily-report-actions";
import { updateChangeOrder } from "@/lib/change-order-actions";
import { updateJobCommandCenter } from "@/lib/command-center-actions";
import { addOpportunityCostCode } from "@/lib/opportunity-actions";
import BudgetLineFields from "@/app/jobs/[id]/cost-codes/new/budget-line-fields";

export const dynamic = "force-dynamic";

const SEVERITY_CLASSES: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  warning: "bg-amber-100 text-amber-700",
};

function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateInput(d: Date | null | undefined): string | undefined {
  return d ? d.toISOString().slice(0, 10) : undefined;
}

/** Not a component — a plain helper, so calling Date.now() here doesn't
 * trip the react-hooks/purity rule the way calling it inline in the
 * component body would. */
function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function Day({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xs font-semibold uppercase tracking-wide bg-slate-900 text-white rounded px-2 py-1">{n}</span>
      <h2 className="text-lg font-medium">{label}</h2>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <section className="bg-white border rounded-lg p-5 space-y-4 scroll-mt-4">{children}</section>;
}

export default async function SmallProjectCockpitPage() {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const identity = await resolveCockpitIdentity(session.companyId);

  if (!identity) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold">Small Project Cockpit</h1>
        <p className="text-slate-600 text-sm bg-white border rounded-lg p-6">
          This cockpit runs on a seeded scenario (Brightside Automotive) that only exists in the demo company. Click{" "}
          <span className="font-medium">Reset Demo</span> from a demo account to load it, then come back to{" "}
          <Link href="/demo/small-project" className="text-blue-600 hover:underline">
            /demo/small-project
          </Link>
          .
        </p>
      </div>
    );
  }

  const canManage = canManageJobs(session.role);
  const canEstimate = canManageEstimates(session.role);
  const foremanPersonaEmail = DEMO_PERSONAS.find((p) => p.key === "foreman")!.email;

  const opportunity = await prisma.opportunity.findFirstOrThrow({
    where: { id: identity.opportunityId },
    include: { customer: true, costCodes: { include: { costCode: true } } },
  });

  const job = identity.jobId
    ? await prisma.job.findFirst({
        where: { id: identity.jobId },
        include: { customer: true, pm: true, foreman: true, assignments: { include: { worker: true } } },
      })
    : null;

  const [
    pmCandidates,
    availableWorkers,
    foremanUser,
    nextEstimateOpportunity,
    allCostCodes,
    allRates,
  ] = await Promise.all([
    prisma.user.findMany({ where: { active: true, role: { in: ["ADMIN", "PM"] } }, orderBy: { name: "asc" } }),
    prisma.worker.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.user.findFirst({ where: { email: foremanPersonaEmail } }),
    prisma.opportunity.findFirst({ where: { companyId: session.companyId, title: NORTHPOINT_TITLE }, include: { costCodes: { include: { costCode: true } } } }),
    prisma.costCode.findMany({ orderBy: { code: "asc" } }),
    getAllCostCodeRatesMap(session.companyId),
  ]);

  const frankWorker = foremanUser ? await prisma.worker.findFirst({ where: { userId: foremanUser.id } }) : null;

  // Everything below Day 0/0b only exists once the job is real.
  const [health, jobCostCodes, checklist, contract, dailyCommandAll, materialRequests, changeOrders, todaysReport] = job
    ? await Promise.all([
        getProjectHealth(session.companyId, job.id),
        prisma.jobCostCode.findMany({ where: { jobId: job.id }, include: { costCode: true, entries: true }, orderBy: { costCode: { code: "asc" } } }),
        prisma.jobChecklistItem.findMany({ where: { jobId: job.id }, orderBy: { createdAt: "asc" } }),
        getContract(session.companyId, job.id),
        getDailyCommand(session.companyId),
        prisma.materialRequest.findMany({ where: { jobId: job.id } }),
        prisma.changeOrder.findMany({ where: { jobId: job.id }, orderBy: { createdAt: "asc" } }),
        prisma.dailyReport.findFirst({ where: { jobId: job.id, date: new Date(todayLocal()) } }),
      ])
    : [null, [], [], null, [], [], [], null];

  const assignedWorkerIds = new Set((job?.assignments ?? []).map((a) => a.workerId));
  const unassignedWorkers = availableWorkers.filter((w) => !assignedWorkerIds.has(w.id));
  const pmCommandItems = job ? dailyCommandAll.filter((i) => i.jobId === job.id) : [];

  const concreteLine = jobCostCodes.find((j) => j.costCode.description.toLowerCase().includes("concrete"));
  const concreteProgress = concreteLine ? computeProgress(concreteLine.estimatedQty, concreteLine.estimatedHours, concreteLine.entries) : null;

  const nextEstimateSlabLine = nextEstimateOpportunity?.costCodes.find((c) =>
    c.costCode.description.toLowerCase().includes("concrete slab")
  );
  const nextEstimateRates = nextEstimateSlabLine ? await getCostCodeRates(session.companyId, nextEstimateSlabLine.costCodeId) : null;

  const startDefault = job?.targetStartDate ? dateInput(job.targetStartDate) : daysFromNow(1);
  const endDefault = job?.targetEndDate ? dateInput(job.targetEndDate) : daysFromNow(7);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="bg-slate-900 text-white rounded-lg p-5 space-y-2">
        <div className="text-xs uppercase tracking-wide text-amber-300 font-semibold">Small Project Cockpit</div>
        <h1 className="text-2xl font-semibold">{opportunity.title}</h1>
        <p className="text-sm text-slate-300">
          One real project, one screen. Every number below is computed live from the same database and actions the rest
          of CrewSync uses — nothing here is a separate calculation.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm pt-2">
          {job && (
            <span className="bg-white/10 rounded px-2 py-1">
              {PROJECT_STAGE_LABEL[job.stage] ?? job.stage}
              {health?.currentDay && health?.plannedDurationDays ? ` · Day ${health.currentDay} of ${health.plannedDurationDays}` : ""}
            </span>
          )}
          <form action={switchDemoRole} className="flex flex-wrap items-center gap-1">
            <input type="hidden" name="returnTo" value="/demo/small-project" />
            <span className="text-slate-400 mr-1">Acting as:</span>
            {DEMO_PERSONAS.map((p) => {
              const active = session.email === p.email;
              return (
                <button
                  key={p.key}
                  type="submit"
                  name="persona"
                  value={p.key}
                  disabled={active}
                  className={active ? "px-2 py-1 rounded bg-amber-600 font-medium" : "px-2 py-1 rounded text-slate-200 hover:bg-white/10"}
                >
                  {p.label}
                </button>
              );
            })}
          </form>
        </div>
      </div>

      {/* ---- DAY 0: AWARD ---- */}
      <Section>
        <Day n="Day 0" label="Award" />
        {!job ? (
          <>
            <p className="text-sm text-slate-600">
              A real, undecided bid — customer, scope, cost codes, and value all carry forward automatically below. The
              PM only fills in dates and who&apos;s running it.
            </p>
            <div className="bg-slate-50 border rounded-md p-3 text-sm space-y-1">
              <div>
                <span className="text-slate-500">Customer:</span> {opportunity.customer?.name ?? opportunity.prospectName}
              </div>
              <div>
                <span className="text-slate-500">Estimated value:</span> {formatMoney(opportunity.estimatedValue)}
              </div>
              <table className="w-full text-xs mt-2">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1">Cost code</th>
                    <th className="py-1 text-right">Qty</th>
                    <th className="py-1 text-right">Hours</th>
                    <th className="py-1 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunity.costCodes.map((cc) => (
                    <tr key={cc.id} className="border-t">
                      <td className="py-1">
                        {cc.costCode.code} — {cc.costCode.description}
                      </td>
                      <td className="py-1 text-right">
                        {cc.estimatedQty} {cc.costCode.unit}
                      </td>
                      <td className="py-1 text-right">{cc.estimatedHours}</td>
                      <td className="py-1 text-right">{(cc.estimatedHours / cc.estimatedQty).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canManage ? (
              <form action={awardProject} className="space-y-3 border rounded-md p-4">
                <input type="hidden" name="returnTo" value="/demo/small-project" />
                <input type="hidden" name="opportunityId" value={opportunity.id} />
                <input type="hidden" name="title" value={opportunity.title} />
                {opportunity.customerId ? (
                  <input type="hidden" name="customerId" value={opportunity.customerId} />
                ) : (
                  <input type="hidden" name="newCustomerName" value={opportunity.prospectName ?? ""} />
                )}
                <input type="hidden" name="contractValue" value={opportunity.estimatedValue ?? ""} />
                <input type="hidden" name="projectType" value={opportunity.projectType ?? ""} />
                {opportunity.costCodes.map((cc) => (
                  <span key={cc.id}>
                    <input type="hidden" name="costCodeId" value={cc.costCodeId} />
                    <input type="hidden" name="costCodeQty" value={cc.estimatedQty} />
                    <input type="hidden" name="costCodeHours" value={cc.estimatedHours} />
                  </span>
                ))}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Start date *</label>
                    <input name="targetStartDate" type="date" required defaultValue={startDefault} className="w-full border rounded-md px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Target completion *</label>
                    <input name="targetEndDate" type="date" required defaultValue={endDefault} className="w-full border rounded-md px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Project manager</label>
                    <select name="pmUserId" className="w-full border rounded-md px-2 py-1.5 text-sm">
                      <option value="">— None —</option>
                      {pmCandidates.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Crew and foreman are deliberately left blank here — Day 0b shows what that leaves open before
                  mobilization.
                </p>
                <button type="submit" className="bg-amber-600 text-white text-sm px-4 py-2 rounded-md hover:bg-amber-700">
                  Award project — creates the real job
                </button>
              </form>
            ) : (
              <p className="text-sm text-slate-500">Switch to Executive or Project Manager to award this project.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
            Awarded as {job.jobNumber} — {job.customer?.name}, {formatMoney(job.contractValue)}. PM:{" "}
            {job.pm?.name ?? "Unassigned"}.
          </p>
        )}
      </Section>

      {/* ---- DAY 0b: WHAT'S MISSING ---- */}
      {job && (
        <Section>
          <Day n="Day 0" label="What's missing before mobilization" />
          <p className="text-sm text-slate-600">
            The project the moment it exists — nothing fake, just what the real checklist and crew state say.
          </p>
          <ul className="text-sm space-y-1">
            <li className={health!.crew.length === 0 ? "text-red-600" : "text-green-700"}>
              {health!.crew.length === 0 ? "✗ Crew not staffed yet" : `✓ Crew: ${health!.crew.join(", ")}`}
            </li>
            <li className={health!.permitNumber ? "text-green-700" : "text-red-600"}>
              {health!.permitNumber ? `✓ Permit on file: ${health!.permitNumber}` : "✗ Permit not confirmed"}
            </li>
            <li className={materialRequests.length > 0 ? "text-green-700" : "text-red-600"}>
              {materialRequests.length > 0 ? `✓ ${materialRequests.length} material request(s) logged` : "✗ Material delivery not confirmed"}
            </li>
            {checklist.filter((c) => !c.done).map((c) => (
              <li key={c.id} className="text-slate-600">
                ○ {c.title}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ---- DAY 1: MOBILIZATION ---- */}
      {job && (
        <Section>
          <Day n="Day 1" label="Mobilization" />
          {health!.crew.length === 0 ? (
            canManage ? (
              <form action={assignCrewToJob} className="space-y-2 border rounded-md p-3">
                <input type="hidden" name="returnTo" value="/demo/small-project" />
                <input type="hidden" name="jobId" value={job.id} />
                <div className="text-xs font-medium text-slate-500">Assign crew for the week</div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {unassignedWorkers.map((w) => (
                    <label key={w.id} className="flex items-center gap-1 text-sm">
                      <input type="checkbox" name="workerIds" value={w.id} defaultChecked={frankWorker?.id === w.id} />
                      {w.name}
                    </label>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input name="startDate" type="date" defaultValue={startDefault} className="border rounded-md px-2 py-1 text-sm" />
                  <span className="text-xs text-slate-400">through</span>
                  <input name="endDate" type="date" defaultValue={endDefault} className="border rounded-md px-2 py-1 text-sm" />
                  <button type="submit" className="bg-slate-900 text-white text-xs px-3 py-1.5 rounded-md hover:bg-slate-700">
                    Assign — real JobAssignment + schedule
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-slate-500">Switch to Executive or Project Manager to assign crew.</p>
            )
          ) : (
            <p className="text-sm text-green-700">Crew assigned: {health!.crew.join(", ")}.</p>
          )}

          <div className="border-t pt-3">
            <div className="text-sm font-medium mb-2">Foreman&apos;s workspace — what {frankWorker?.name ?? "the foreman"} sees</div>
            {health!.crew.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing here yet for this project — assign crew above first.</p>
            ) : (
              <div className="text-sm space-y-1">
                <div>Crew: {health!.crew.join(", ")}</div>
                <div className="text-xs text-slate-500">
                  {jobCostCodes.map((jcc) => `${jcc.costCode.code} est ${jcc.estimatedHours}hrs/${jcc.estimatedQty}${jcc.costCode.unit}`).join(" · ")}
                </div>
                <div className={todaysReport ? "text-green-700" : "text-amber-700"}>
                  {todaysReport ? "Today's report already submitted" : "No report submitted yet today"}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ---- DAY 2: FIELD EXECUTION ---- */}
      {job && (
        <Section>
          <Day n="Day 2" label="Field execution — one daily report" />
          <p className="text-sm text-slate-600">
            Labor, an equipment issue, a material need, and a changed condition — all in the ONE submission a foreman
            actually makes.
            {todaysReport && <span className="text-green-700 font-medium"> Already submitted for today — resubmitting updates it in place.</span>}
          </p>
          <form action={submitDailyReport} encType="multipart/form-data" className="space-y-3 border rounded-md p-4">
            <input type="hidden" name="returnTo" value="/demo/small-project" />
            <input type="hidden" name="jobId" value={job.id} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Date</label>
                <input name="date" type="date" defaultValue={todayLocal()} className="w-full border rounded-md px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Crew size</label>
                <input name="crewSize" type="number" min="0" defaultValue={health!.crew.length || ""} className="w-full border rounded-md px-2 py-1.5 text-sm" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-500">Labor &amp; production today</div>
              {jobCostCodes.map((jcc) => (
                <div key={jcc.id} className="flex items-center gap-2 text-sm">
                  <input type="hidden" name="rowJobCostCodeId" value={jcc.id} />
                  <div className="flex-1">
                    {jcc.costCode.code} — {jcc.costCode.description}
                  </div>
                  <input name="rowHours" type="number" step="any" min="0" placeholder="Hrs" className="w-20 border rounded-md px-2 py-1.5 text-sm" />
                  <input name="rowQty" type="number" step="any" min="0" placeholder={jcc.costCode.unit} className="w-24 border rounded-md px-2 py-1.5 text-sm" />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Work completed</label>
              <textarea name="workCompleted" rows={2} className="w-full border rounded-md px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Material needed</label>
              <textarea name="materialNeeded" rows={2} placeholder="Opens a material request automatically" className="w-full border rounded-md px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Equipment issue</label>
              <textarea name="equipmentIssue" rows={2} placeholder="Shows up as a PM exception automatically" className="w-full border rounded-md px-2 py-1.5 text-sm" />
            </div>
            <div className="border rounded-md p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="hasChangeCondition" id="hasChangeCondition" />
                Change condition (unplanned extra work)
              </label>
              <textarea name="changeConditionNotes" rows={2} placeholder="Opens a pending change order automatically" className="w-full border rounded-md px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Submitted by</label>
              <select name="submittedById" defaultValue={frankWorker?.id ?? ""} className="w-full border rounded-md px-2 py-1.5 text-sm">
                <option value="">— None —</option>
                {availableWorkers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="w-full bg-amber-600 text-white text-sm px-4 py-2.5 rounded-md hover:bg-amber-700">
              Submit daily update
            </button>
          </form>
        </Section>
      )}

      {/* ---- DAY 2: ENTER ONCE -> PROPAGATION ---- */}
      {job && concreteLine && concreteProgress && (
        <Section>
          <Day n="Day 2" label="Enter once — CrewSync handles the rest" />
          <p className="text-sm text-slate-600">
            That one submission is already live everywhere below — nothing else to fill out. All real, computed from
            the same record.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-50 rounded-md p-2">
              <div className="text-slate-500">Daily report</div>
              <div className="font-medium">{concreteProgress.actualHours || "—"} hrs / {concreteProgress.actualQty || "—"} {concreteLine.costCode.unit}</div>
            </div>
            <div className="bg-slate-50 rounded-md p-2">
              <div className="text-slate-500">Labor productivity</div>
              <div className="font-medium">
                est {concreteProgress.estimatedRate?.toFixed(2)} → actual {concreteProgress.actualRate?.toFixed(2) ?? "—"} hrs/{concreteLine.costCode.unit}
              </div>
            </div>
            <div className="bg-slate-50 rounded-md p-2">
              <div className="text-slate-500">Job cost</div>
              <div className="font-medium">{formatMoney(health!.actualLaborCost)} actual</div>
            </div>
            <div className="bg-slate-50 rounded-md p-2">
              <div className="text-slate-500">Labor forecast</div>
              <div className="font-medium">{health!.projectedLaborHours.toFixed(0)} hrs at completion</div>
            </div>
            <div className="bg-slate-50 rounded-md p-2">
              <div className="text-slate-500">PM exception</div>
              <div className={`font-medium ${pmCommandItems.length > 0 ? "text-red-600" : ""}`}>
                {pmCommandItems.length > 0 ? `${pmCommandItems.length} open` : "None yet"}
              </div>
            </div>
            <div className="bg-slate-50 rounded-md p-2">
              <div className="text-slate-500">Project margin forecast</div>
              <div className="font-medium">{health!.projectedMarginPct !== null ? `${(health!.projectedMarginPct * 100).toFixed(1)}%` : "—"}</div>
            </div>
            <div className="bg-slate-50 rounded-md p-2 col-span-2">
              <div className="text-slate-500">Company command</div>
              <div className="font-medium">
                {pmCommandItems.length > 0 ? "This project now appears on the Action Center as an exception." : "Clean — nothing flagged company-wide."}
              </div>
            </div>
          </div>
          {concreteProgress.hoursVariancePct !== null && (
            <p className={`text-sm font-medium ${concreteProgress.hoursVariancePct > 0.15 ? "text-red-600" : "text-slate-700"}`}>
              Labor variance: {concreteProgress.hoursVariancePct >= 0 ? "+" : ""}
              {(concreteProgress.hoursVariancePct * 100).toFixed(0)}% vs. estimate
            </p>
          )}
        </Section>
      )}

      {/* ---- DAY 3: PM DAILY COMMAND ---- */}
      {job && (
        <Section>
          <Day n="Day 3" label="PM Daily Command" />
          {pmCommandItems.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing flagged on this project right now.</p>
          ) : (
            <div className="space-y-3">
              {pmCommandItems.map((item, i) => (
                <div key={i} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm">{item.message}</p>
                    <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${SEVERITY_CLASSES[item.severity]}`}>
                      {ALERT_TYPE_LABEL[item.type]}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs border-t pt-2">
                    <div>
                      <div className="text-slate-400">Why</div>
                      <div>{item.why}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Impact</div>
                      <div>{item.impact}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Owner</div>
                      <div>{item.owner}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Due</div>
                      <div>{item.dueLabel}</div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">Action: {item.action}</p>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ---- DAY 4: CHANGE MANAGEMENT ---- */}
      {job && (
        <Section>
          <Day n="Day 4" label="Change management" />
          {changeOrders.length === 0 ? (
            <p className="text-sm text-slate-500">No change orders yet — Day 2&apos;s flagged condition opens one automatically.</p>
          ) : (
            <div className="space-y-3">
              {changeOrders.map((co) => (
                <div key={co.id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">{co.title}</div>
                    <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">{co.status}</span>
                  </div>
                  {co.description && <p className="text-xs text-slate-500">{co.description}</p>}
                  {co.status !== "APPROVED" && co.status !== "REJECTED" ? (
                    canManage ? (
                      <form action={updateChangeOrder} className="flex flex-wrap items-end gap-2 pt-2 border-t text-xs">
                        <input type="hidden" name="returnTo" value="/demo/small-project" />
                        <input type="hidden" name="id" value={co.id} />
                        <input type="hidden" name="jobId" value={job.id} />
                        <div>
                          <label className="block mb-1">Status</label>
                          <select name="status" defaultValue={co.status} className="border rounded-md px-2 py-1">
                            <option value="IDENTIFIED">Identified</option>
                            <option value="PRICED">Priced</option>
                            <option value="SUBMITTED">Submitted</option>
                            <option value="APPROVED">Approved</option>
                            <option value="REJECTED">Rejected</option>
                          </select>
                        </div>
                        <div>
                          <label className="block mb-1">Revenue $</label>
                          <input name="revenueAmount" type="number" step="any" min="0" defaultValue={co.revenueAmount ?? ""} className="border rounded-md px-2 py-1 w-24" />
                        </div>
                        <div>
                          <label className="block mb-1">Cost $</label>
                          <input name="costAmount" type="number" step="any" min="0" defaultValue={co.costAmount ?? ""} className="border rounded-md px-2 py-1 w-24" />
                        </div>
                        <button type="submit" className="bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-700">
                          Save
                        </button>
                      </form>
                    ) : (
                      <p className="text-xs text-slate-500">Switch to Executive or Project Manager to price and approve.</p>
                    )
                  ) : (
                    <p className="text-xs text-slate-600">
                      Revenue {formatMoney(co.revenueAmount)} · Cost {formatMoney(co.costAmount)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          {contract && (
            <p className="text-sm text-slate-600 border-t pt-3">
              Contract: {formatMoney(job!.contractValue)} original → {formatMoney(contract.scheduledTotal)} current
              (SOV, {contract.lines.length} line{contract.lines.length === 1 ? "" : "s"}).
            </p>
          )}
        </Section>
      )}

      {/* ---- DAY 5: ACCOUNTING HANDOFF ---- */}
      {job && (
        <Section>
          <Day n="Day 5" label="Accounting handoff" />
          <p className="text-sm text-slate-600">
            Accounting never has to call the PM to ask if the job is ready to bill — it&apos;s already here.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-slate-500 text-xs">Original contract</div>
              <div className="font-medium">{formatMoney(job.contractValue)}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs">Approved change orders</div>
              <div className="font-medium">{formatMoney(health!.approvedChangeOrderRevenue)}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs">Current contract value</div>
              <div className="font-medium">{formatMoney(contract?.scheduledTotal ?? health!.currentContractValue)}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs">Billed to date</div>
              <div className="font-medium">{formatMoney(contract?.billedTotal ?? 0)}</div>
            </div>
          </div>
          <div className="border-t pt-3">
            <div className="text-sm font-medium mb-1">
              Billing readiness: {health!.billingReadiness.ready ? "Ready" : `Not ready — ${health!.billingReadiness.checks.filter((c) => !c.ok).length} open item(s)`}
            </div>
            <ul className="text-xs space-y-1">
              {health!.billingReadiness.checks.map((c) => (
                <li key={c.key} className={c.ok ? "text-green-700" : "text-red-600"}>
                  {c.ok ? "✓" : "✗"} {c.label} — {c.detail}
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      {/* ---- DAY 6-7: CLOSEOUT ---- */}
      {job && (
        <Section>
          <Day n="Day 6-7" label="Closeout" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-slate-500 text-xs">Final labor hours (est / actual)</div>
              <div className="font-medium">
                {health!.estimatedLaborHours.toFixed(0)} / {health!.actualLaborHours.toFixed(0)}
              </div>
            </div>
            <div>
              <div className="text-slate-500 text-xs">Labor variance</div>
              <div className={`font-medium ${health!.laborHoursVariance > 0 ? "text-red-600" : ""}`}>
                {health!.laborHoursVariance >= 0 ? "+" : ""}
                {health!.laborHoursVariance.toFixed(0)} hrs
              </div>
            </div>
            <div>
              <div className="text-slate-500 text-xs">Projected margin</div>
              <div className="font-medium">{health!.projectedMarginPct !== null ? `${(health!.projectedMarginPct * 100).toFixed(1)}%` : "—"}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs">Remaining to bill</div>
              <div className="font-medium">{formatMoney((contract?.scheduledTotal ?? 0) - (contract?.billedTotal ?? 0))}</div>
            </div>
          </div>

          {job.stage === "COMPLETE" ? (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
              Project closed out. Its actual production is now part of company historical productivity.
            </p>
          ) : canManage ? (
            <form action={updateJobCommandCenter} className="border-t pt-3 space-y-2">
              <input type="hidden" name="returnTo" value="/demo/small-project" />
              <input type="hidden" name="jobId" value={job.id} />
              <input type="hidden" name="stage" value="COMPLETE" />
              <input type="hidden" name="contractValue" value={job.contractValue ?? ""} />
              <input type="hidden" name="pmUserId" value={job.pmUserId ?? ""} />
              <input type="hidden" name="foremanWorkerId" value={job.foremanWorkerId ?? ""} />
              <input type="hidden" name="divisionId" value={job.divisionId ?? ""} />
              <input type="hidden" name="targetStartDate" value={dateInput(job.targetStartDate) ?? ""} />
              <input type="hidden" name="targetEndDate" value={dateInput(job.targetEndDate) ?? ""} />
              <input type="hidden" name="projectType" value={job.projectType ?? ""} />
              <input type="hidden" name="permitNumber" value={job.permitNumber ?? ""} />
              <input type="hidden" name="permitIssuedDate" value={dateInput(job.permitIssuedDate) ?? ""} />
              <input type="hidden" name="permitExpirationDate" value={dateInput(job.permitExpirationDate) ?? ""} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="punchListComplete" defaultChecked={job.punchListComplete} /> Punch list complete
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="requiredDocsComplete" defaultChecked={job.requiredDocsComplete} /> Required documents complete
              </label>
              <button type="submit" className="bg-amber-600 text-white text-sm px-4 py-2 rounded-md hover:bg-amber-700">
                Close out project — mark COMPLETE
              </button>
            </form>
          ) : (
            <p className="text-sm text-slate-500">Switch to Executive or Project Manager to close out the project.</p>
          )}
        </Section>
      )}

      {/* ---- NEXT ESTIMATE: CLOSED LOOP ---- */}
      {job?.stage === "COMPLETE" && nextEstimateOpportunity && (
        <Section>
          <Day n="Next estimate" label="Closed loop" />
          <p className="text-sm text-slate-600">
            {nextEstimateOpportunity.title} — a similar future bid. Its concrete estimate now shows against real
            company history, including the project just closed.
          </p>
          {nextEstimateSlabLine && nextEstimateRates ? (
            <div className="bg-slate-50 border rounded-md p-3 text-sm space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <div className="text-slate-500">Estimator assumption</div>
                  <div className="font-medium">{(nextEstimateSlabLine.estimatedHours / nextEstimateSlabLine.estimatedQty).toFixed(2)} hrs/CY</div>
                </div>
                <div>
                  <div className="text-slate-500">Company historical</div>
                  <div className="font-medium">{nextEstimateRates.companyRate?.toFixed(2) ?? "—"} hrs/CY</div>
                </div>
                <div>
                  <div className="text-slate-500">Recent jobs</div>
                  <div className="font-medium">{nextEstimateRates.recentRate?.toFixed(2) ?? "—"} hrs/CY</div>
                </div>
                <div>
                  <div className="text-slate-500">Recommended</div>
                  <div className="font-medium">{nextEstimateRates.recommendedRate?.toFixed(2) ?? "—"} hrs/CY</div>
                </div>
              </div>
              {nextEstimateRates.recommendedRate !== null &&
                nextEstimateSlabLine.estimatedHours / nextEstimateSlabLine.estimatedQty < nextEstimateRates.recommendedRate && (
                  <p className="text-sm font-medium text-amber-700">
                    This estimate is more aggressive than your company&apos;s actual performance.
                  </p>
                )}
            </div>
          ) : canEstimate ? (
            <form action={addOpportunityCostCode} className="space-y-3 border rounded-md p-4">
              <input type="hidden" name="returnTo" value="/demo/small-project" />
              <input type="hidden" name="opportunityId" value={nextEstimateOpportunity.id} />
              <BudgetLineFields
                costCodes={allCostCodes.map((cc) => ({ id: cc.id, code: cc.code, description: cc.description, unit: cc.unit }))}
                rates={allRates}
              />
              <button type="submit" className="bg-amber-600 text-white text-sm px-4 py-2 rounded-md hover:bg-amber-700">
                Add bid line — see it against real history
              </button>
            </form>
          ) : (
            <p className="text-sm text-slate-500">Switch to Estimator to add the concrete bid line.</p>
          )}
        </Section>
      )}

      {/* ---- SUMMARY ---- */}
      {job?.stage === "COMPLETE" && (
        <Section>
          <Day n="Summary" label="Without vs. with CrewSync" />
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <div className="font-semibold text-red-700 mb-1">Without CrewSync</div>
              <ul className="space-y-0.5 text-red-800">
                <li>Multiple handoffs</li>
                <li>Duplicate entry</li>
                <li>PM chasing field updates</li>
                <li>Accounting chasing PM</li>
                <li>Labor overruns discovered late</li>
                <li>Change work missed</li>
                <li>Historical production unused</li>
              </ul>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-md p-3">
              <div className="font-semibold text-green-700 mb-1">With CrewSync</div>
              <ul className="space-y-0.5 text-green-800">
                <li>Enter once</li>
                <li>Automatic handoffs</li>
                <li>Real-time productivity</li>
                <li>Exception-driven PM workflow</li>
                <li>Automatic job-cost forecasting</li>
                <li>Field-to-CO connection</li>
                <li>Billing readiness</li>
                <li>Closed-loop estimating intelligence</li>
              </ul>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
