import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { requireSession } from "@/lib/session";
import { isAiConfigured } from "@/lib/ai/client";
import AiSummaryPanel from "./ai-summary";

export const dynamic = "force-dynamic";

export default async function DailyReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;
  const [job, reports] = await Promise.all([
    prisma.job.findFirst({ where: { id } }),
    prisma.dailyReport.findMany({
      where: { jobId: id },
      orderBy: { date: "desc" },
      include: { submittedBy: true, photos: { select: { id: true } } },
    }),
  ]);
  if (!job) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/jobs/${job.id}`} className="text-sm text-blue-600 hover:underline">
            &larr; {job.title}
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Daily reports</h1>
        </div>
        <Link
          href={`/jobs/${job.id}/daily-reports/new`}
          className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
        >
          + New report
        </Link>
      </div>

      {reports.length > 0 && isAiConfigured() && <AiSummaryPanel jobId={job.id} />}

      {reports.length === 0 ? (
        <p className="text-slate-500 text-sm">No daily reports yet.</p>
      ) : (
        <div className="bg-white border rounded-lg divide-y">
          {reports.map((r) => {
            const flags = [
              r.blockers && "blockers",
              r.materialNeeded && "material needed",
              r.equipmentIssue && "equipment issue",
              r.safetyIssue && "safety issue",
              r.hasChangeCondition && "change condition",
              r.delayReason && "delay",
            ].filter(Boolean) as string[];
            return (
              <Link
                key={r.id}
                href={`/jobs/${job.id}/daily-reports/${r.id}`}
                className="block px-4 py-3 hover:bg-slate-50"
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{new Date(r.date).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })}</div>
                  <div className="text-xs text-slate-500">
                    {r.crewSize ? `crew of ${r.crewSize}` : ""}
                    {r.hours ? ` · ${r.hours} hrs` : ""}
                    {r.photos.length > 0 ? ` · ${r.photos.length} photo${r.photos.length === 1 ? "" : "s"}` : ""}
                  </div>
                </div>
                {r.workCompleted && <p className="text-sm text-slate-600 mt-1">{r.workCompleted}</p>}
                {flags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {flags.map((f) => (
                      <span key={f} className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
