import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { requireSession } from "@/lib/session";
import { createChangeOrder } from "@/lib/change-order-actions";

export default async function NewChangeOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sourceDailyReportId?: string }>;
}) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;
  const { sourceDailyReportId } = await searchParams;
  const [job, workers, sourceReportRaw] = await Promise.all([
    prisma.job.findFirst({ where: { id } }),
    prisma.worker.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    sourceDailyReportId ? prisma.dailyReport.findUnique({ where: { id: sourceDailyReportId } }) : null,
  ]);
  if (!job) notFound();
  // DailyReport isn't a tenant model — only trust it as a prefill source if
  // it actually belongs to this job (and therefore this company).
  const sourceReport = sourceReportRaw && sourceReportRaw.jobId === job.id ? sourceReportRaw : null;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href={`/jobs/${job.id}/change-orders`} className="text-sm text-blue-600 hover:underline">
          &larr; Change orders
        </Link>
        <h1 className="text-2xl font-semibold mt-1">New change order</h1>
        {sourceReport && (
          <p className="text-slate-500 text-sm mt-1">
            From the change condition flagged on {new Date(sourceReport.date).toLocaleDateString("en-US", { timeZone: "UTC" })}.
          </p>
        )}
      </div>

      <form action={createChangeOrder} className="space-y-4 bg-white border rounded-lg p-6">
        <input type="hidden" name="jobId" value={job.id} />
        {sourceReport && <input type="hidden" name="sourceDailyReportId" value={sourceReport.id} />}

        <div>
          <label className="block text-sm font-medium mb-1">Title *</label>
          <input
            name="title"
            required
            defaultValue={sourceReport?.changeConditionNotes?.slice(0, 80) ?? ""}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            name="description"
            rows={4}
            defaultValue={sourceReport?.changeConditionNotes ?? ""}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Identified by</label>
          <select name="createdById" className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="">— None —</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
          Create change order
        </button>
      </form>
    </div>
  );
}
