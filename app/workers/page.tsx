import Link from "next/link";
import { scopedPrisma } from "@/lib/tenant";
import { requireSession } from "@/lib/session";
import { canManageJobs } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function WorkersPage() {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const workers = await prisma.worker.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Workers</h1>
        {session && canManageJobs(session.role) && (
          <Link
            href="/workers/new"
            className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
          >
            + Add worker
          </Link>
        )}
      </div>

      {workers.length === 0 ? (
        <p className="text-slate-500 text-sm">No workers yet.</p>
      ) : (
        <div className="bg-white border rounded-lg divide-y">
          {workers.map((w) => (
            <Link key={w.id} href={`/workers/${w.id}`} className="block px-4 py-3 hover:bg-slate-50">
              <div className="font-medium">{w.name}</div>
              <div className="text-sm text-slate-500">
                {[w.role, w.phone, w.email].filter(Boolean).join(" · ") || "—"}
                {!w.active && " · inactive"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
