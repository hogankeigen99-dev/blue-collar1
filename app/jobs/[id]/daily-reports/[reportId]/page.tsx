import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function DailyReportDetailPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { id, reportId } = await params;
  const report = await prisma.dailyReport.findUnique({
    where: { id: reportId },
    include: { submittedBy: true, photos: true, job: true },
  });
  if (!report || report.jobId !== id) notFound();

  const rows: [string, string | null | undefined][] = [
    ["Work completed", report.workCompleted],
    ["Quantity installed", report.quantityInstalled],
    ["Blockers", report.blockers],
    ["Material needed", report.materialNeeded],
    ["Equipment issue", report.equipmentIssue],
    ["Safety issue", report.safetyIssue],
    ["Delay reason", report.delayReason],
    ["Tomorrow's plan", report.tomorrowPlan],
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href={`/jobs/${id}/daily-reports`} className="text-sm text-blue-600 hover:underline">
          &larr; Daily reports
        </Link>
        <h1 className="text-2xl font-semibold mt-1">
          {new Date(report.date).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" })}
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {report.crewSize ? `Crew of ${report.crewSize}` : "Crew size not recorded"}
          {report.hours ? ` · ${report.hours} hrs` : ""}
          {report.submittedBy ? ` · submitted by ${report.submittedBy.name}` : ""}
        </p>
      </div>

      {report.hasChangeCondition && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-md px-4 py-3">
          <div className="font-medium">Change condition flagged</div>
          {report.changeConditionNotes && <p className="mt-1">{report.changeConditionNotes}</p>}
          <Link
            href={`/jobs/${id}/change-orders/new?sourceDailyReportId=${report.id}`}
            className="inline-block mt-2 text-blue-700 hover:underline"
          >
            Create change order from this →
          </Link>
        </div>
      )}

      <div className="bg-white border rounded-lg p-6 space-y-4">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <div className="text-sm font-medium text-slate-500">{label}</div>
              <p className="text-sm whitespace-pre-wrap">{value}</p>
            </div>
          ))}
        {rows.every(([, value]) => !value) && (
          <p className="text-sm text-slate-500">No notes recorded on this report.</p>
        )}
      </div>

      {report.photos.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-slate-500 mb-2">Photos</h2>
          <div className="grid grid-cols-3 gap-3">
            {report.photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.id}
                src={`/api/photos/${p.id}`}
                alt="Daily report photo"
                className="w-full h-32 object-cover rounded-md border"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
