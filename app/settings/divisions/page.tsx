import { scopedPrisma } from "@/lib/tenant";
import { createDivision, renameDivision, deleteDivision } from "@/lib/division-actions";
import { requirePageRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DivisionsPage() {
  const session = await requirePageRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);

  const divisions = await prisma.division.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true, jobs: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Divisions</h1>
        <p className="text-slate-500 text-sm mt-1">
          Organizational segmentation within your company — group jobs and workers by
          division, region, or business line. Not a security boundary: every division
          shares the same company-wide data isolation.
        </p>
      </div>

      <form action={createDivision} className="flex items-end gap-2 bg-white border rounded-lg p-4">
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1">New division name</label>
          <input name="name" required placeholder="e.g. Concrete Division" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
          Add division
        </button>
      </form>

      {divisions.length === 0 ? (
        <p className="text-slate-500 text-sm">No divisions yet — jobs and workers stay unassigned until you add one.</p>
      ) : (
        <div className="bg-white border rounded-lg divide-y">
          {divisions.map((d) => (
            <div key={d.id} className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
              <form action={renameDivision} className="flex items-center gap-2 flex-1">
                <input type="hidden" name="id" value={d.id} />
                <input name="name" defaultValue={d.name} className="border rounded-md px-2 py-1 flex-1 max-w-xs" />
                <button type="submit" className="text-xs px-2 py-1 rounded-md border hover:bg-slate-50">
                  Rename
                </button>
              </form>
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {d._count.jobs} job{d._count.jobs === 1 ? "" : "s"} · {d._count.users} worker{d._count.users === 1 ? "" : "s"}
              </span>
              <form action={deleteDivision}>
                <input type="hidden" name="id" value={d.id} />
                <button type="submit" className="text-xs text-red-600 hover:underline">
                  Delete
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
