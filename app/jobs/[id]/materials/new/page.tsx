import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { requireSession } from "@/lib/session";
import { createMaterialRequest } from "@/lib/productivity-actions";

export default async function NewMaterialRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;
  const [job, workers] = await Promise.all([
    prisma.job.findFirst({ where: { id } }),
    prisma.worker.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!job) notFound();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href={`/jobs/${job.id}/materials`} className="text-sm text-blue-600 hover:underline">
          &larr; Materials
        </Link>
        <h1 className="text-2xl font-semibold mt-1">Request material</h1>
      </div>

      <form action={createMaterialRequest} className="space-y-4 bg-white border rounded-lg p-6">
        <input type="hidden" name="jobId" value={job.id} />

        <div>
          <label className="block text-sm font-medium mb-1">Description *</label>
          <input name="description" required placeholder="e.g. #4 rebar" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Quantity *</label>
            <input name="quantity" type="number" step="any" min="0" required className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Unit *</label>
            <input name="unit" required placeholder="e.g. TON, EA" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Requested by</label>
          <select name="requestedById" className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="">— None —</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
          Submit request
        </button>
      </form>
    </div>
  );
}
