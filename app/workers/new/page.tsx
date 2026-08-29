import { scopedPrisma } from "@/lib/tenant";
import { createWorker } from "@/lib/actions";
import { requirePageRole } from "@/lib/session";

export default async function NewWorkerPage() {
  const session = await requirePageRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const divisions = await prisma.division.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Add worker</h1>
      <form action={createWorker} className="space-y-4 bg-white border rounded-lg p-6">
        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input name="name" required className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Role / trade</label>
          <input
            name="role"
            placeholder="e.g. Electrician"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
        {divisions.length > 0 && (
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
        )}
        <div>
          <label className="block text-sm font-medium mb-1">Phone</label>
          <input name="phone" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input name="email" type="email" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Labor rate ($/hr)</label>
          <p className="text-xs text-slate-500 mb-1">Used to price actual labor cost from logged production hours.</p>
          <input name="laborRate" type="number" step="any" min="0" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <button
          type="submit"
          className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
        >
          Add worker
        </button>
      </form>
    </div>
  );
}
