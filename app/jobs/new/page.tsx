import { prisma } from "@/lib/prisma";
import { createJob } from "@/lib/actions";
import { requirePageRole } from "@/lib/session";

export default async function NewJobPage() {
  await requirePageRole("ADMIN", "PM");
  const [customers, workers] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
    prisma.worker.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">New job</h1>
      <form action={createJob} className="space-y-4 bg-white border rounded-lg p-6">
        <div>
          <label className="block text-sm font-medium mb-1">Title *</label>
          <input
            name="title"
            required
            className="w-full border rounded-md px-3 py-2 text-sm"
            placeholder="e.g. Fix breaker panel"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            name="description"
            rows={3}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Job address</label>
          <input name="address" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Customer</label>
          <select name="customerId" className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="">— None —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Scheduled at</label>
          <input
            type="datetime-local"
            name="scheduledAt"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Assign workers</label>
          <div className="space-y-1 max-h-40 overflow-auto border rounded-md p-2">
            {workers.length === 0 && (
              <p className="text-sm text-slate-500">No workers yet.</p>
            )}
            {workers.map((w) => (
              <label key={w.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="workerIds" value={w.id} />
                {w.name}
                {w.role && <span className="text-slate-400">({w.role})</span>}
              </label>
            ))}
          </div>
        </div>

        <button
          type="submit"
          className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
        >
          Create job
        </button>
      </form>
    </div>
  );
}
