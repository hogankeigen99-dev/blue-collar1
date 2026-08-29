import Link from "next/link";
import { scopedPrisma } from "@/lib/tenant";
import { awardProject } from "@/lib/award-actions";
import { getAllCostCodeRatesMap } from "@/lib/productivity-benchmarks";
import { requirePageRole } from "@/lib/session";
import AwardRepeatableSections from "./award-form";

export default async function AwardProjectPage() {
  const session = await requirePageRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const [customers, workers, users, costCodes, equipment, divisions, projectTypeRows, rates] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
    prisma.worker.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.costCode.findMany({ orderBy: { code: "asc" } }),
    prisma.equipment.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.division.findMany({ orderBy: { name: "asc" } }),
    prisma.job.findMany({ where: { projectType: { not: null } }, select: { projectType: true }, distinct: ["projectType"] }),
    getAllCostCodeRatesMap(session.companyId),
  ]);
  const projectTypes = projectTypeRows.map((j) => j.projectType!).sort();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Award project</h1>
        <p className="text-sm text-slate-500 mt-1">
          Everything captured here — customer, contract, budget, cost codes, PM/foreman/crew, dates, and any
          known materials/equipment/subcontractors — sets up the project in one pass. The crew&apos;s schedule
          and the startup checklist are generated automatically.
        </p>
      </div>

      <form action={awardProject} className="space-y-8 bg-white border rounded-lg p-6">
        {/* Project & customer */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Project</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Project title *</label>
              <input
                name="title"
                required
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="e.g. Oakwood Ave — Sitework and Slab"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Customer</label>
              <select name="customerId" className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="">— New customer (name below) —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">New customer name</label>
              <input
                name="newCustomerName"
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="Only if not selected above"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Project location</label>
              <input name="location" className="w-full border rounded-md px-3 py-2 text-sm" placeholder="Job site address" />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea name="description" rows={2} className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Contract value ($)</label>
              <input name="contractValue" type="number" step="any" className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Division</label>
              <select name="divisionId" className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="">— None —</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Project type</label>
              <input
                name="projectType"
                list="projectTypeOptions"
                placeholder="e.g. Residential slab, Commercial TI, Site work"
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
              <datalist id="projectTypeOptions">
                {projectTypes.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              <p className="text-xs text-slate-500 mt-1">
                Groups this job into the right comparison once it&apos;s complete — see{" "}
                <Link href="/cost-codes" className="text-blue-600 hover:underline">
                  historical productivity
                </Link>
                .
              </p>
            </div>
          </div>
        </div>

        {/* Schedule & team */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Schedule &amp; team</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start date</label>
              <input name="targetStartDate" type="date" className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Target completion date</label>
              <input name="targetEndDate" type="date" className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Project manager</label>
              <select name="pmUserId" className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="">— None —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Foreman</label>
              <select name="foremanWorkerId" className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="">— None —</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Crew — also generates their day-by-day schedule for the dates above
            </label>
            <div className="space-y-1 max-h-40 overflow-auto border rounded-md p-2">
              {workers.length === 0 && <p className="text-sm text-slate-500">No workers yet.</p>}
              {workers.map((w) => (
                <label key={w.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="workerIds" value={w.id} />
                  {w.name}
                  {w.role && <span className="text-slate-400">({w.role})</span>}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Budget by category */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Budget by category</h2>
          <div className="grid grid-cols-3 gap-4">
            {(["LABOR", "MATERIAL", "EQUIPMENT", "SUBCONTRACTOR", "OTHER"] as const).map((cat) => (
              <div key={cat}>
                <label className="block text-sm font-medium mb-1 capitalize">{cat.toLowerCase()} ($)</label>
                <input name={`budget_${cat}`} type="number" step="any" className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
            ))}
          </div>
        </div>

        <AwardRepeatableSections
          costCodes={costCodes.map((cc) => ({ id: cc.id, code: cc.code, description: cc.description, unit: cc.unit }))}
          equipmentList={equipment.map((e) => ({ id: e.id, name: e.name, type: e.type }))}
          rates={rates}
        />

        <button type="submit" className="bg-slate-900 text-white text-sm px-5 py-2.5 rounded-md hover:bg-slate-700">
          Award project
        </button>
      </form>
    </div>
  );
}
