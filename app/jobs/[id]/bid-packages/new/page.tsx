import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { createBidPackage } from "@/lib/subbid-actions";
import { requirePageRole } from "@/lib/session";

export default async function NewBidPackagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePageRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;
  const job = await prisma.job.findFirst({ where: { id } });
  if (!job) notFound();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href={`/jobs/${job.id}/bid-packages`} className="text-sm text-blue-600 hover:underline">
          &larr; Bid packages
        </Link>
        <h1 className="text-2xl font-semibold mt-1">New bid package</h1>
      </div>

      <form action={createBidPackage} className="space-y-4 bg-white border rounded-lg p-6">
        <input type="hidden" name="jobId" value={job.id} />

        <div>
          <label className="block text-sm font-medium mb-1">Title *</label>
          <input name="title" required className="w-full border rounded-md px-3 py-2 text-sm" placeholder="e.g. Electrical rough-in" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Scope of work</label>
          <textarea
            name="scope"
            rows={4}
            className="w-full border rounded-md px-3 py-2 text-sm"
            placeholder="What every invited sub should be quoting against — the baseline for comparing what comes back"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Bids due</label>
          <input name="dueDate" type="date" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>

        <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
          Create bid package
        </button>
      </form>
    </div>
  );
}
