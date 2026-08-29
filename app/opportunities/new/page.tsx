import { scopedPrisma } from "@/lib/tenant";
import { createOpportunity } from "@/lib/opportunity-actions";
import { requirePageRole } from "@/lib/session";

export default async function NewOpportunityPage() {
  const session = await requirePageRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);

  const [customers, pmUsers, projectTypeRows] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "PM"] }, active: true }, orderBy: { name: "asc" } }),
    prisma.job.findMany({ where: { projectType: { not: null } }, select: { projectType: true }, distinct: ["projectType"] }),
  ]);
  const projectTypes = projectTypeRows.map((j) => j.projectType!).sort();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New opportunity</h1>
        <p className="text-slate-500 text-sm mt-1">
          What&apos;s being bid — the estimate lines come next, on the opportunity&apos;s own page, with the same
          historical rates the Award form already shows.
        </p>
      </div>

      <form action={createOpportunity} className="space-y-4 bg-white border rounded-lg p-6">
        <div>
          <label className="block text-sm font-medium mb-1">Opportunity title *</label>
          <input name="title" required className="w-full border rounded-md px-3 py-2 text-sm" placeholder="e.g. Riverside Phase 3 — Sitework" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Customer</label>
            <select name="customerId" className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">— No customer record yet —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Prospect name</label>
            <input name="prospectName" className="w-full border rounded-md px-3 py-2 text-sm" placeholder="Only if not selected above" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Source</label>
            <input name="source" className="w-full border rounded-md px-3 py-2 text-sm" placeholder="Referral, plan room, repeat client…" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Project type</label>
            <input name="projectType" list="projectTypeOptions" className="w-full border rounded-md px-3 py-2 text-sm" placeholder="e.g. Site work" />
            <datalist id="projectTypeOptions">
              {projectTypes.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Estimated value ($)</label>
            <input name="estimatedValue" type="number" step="any" min="0" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Win probability (%)</label>
            <input name="probability" type="number" step="1" min="0" max="100" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Bid due date</label>
            <input name="bidDueDate" type="date" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Assigned to</label>
          <select name="assignedToUserId" className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="">— None —</option>
            {pmUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
            ))}
          </select>
        </div>

        <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
          Add opportunity
        </button>
      </form>
    </div>
  );
}
