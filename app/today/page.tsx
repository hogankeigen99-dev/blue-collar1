import Link from "next/link";
import { getDailyCommand } from "@/lib/pm-daily-command";
import { ALERT_TYPE_LABEL } from "@/lib/alerts";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const SEVERITY_CLASSES: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  warning: "bg-amber-100 text-amber-700",
};

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const session = await requireSession();
  const { all } = await searchParams;
  const allItems = await getDailyCommand(session.companyId);

  // A PM's default view is their own jobs only — the same "give each role
  // their own world" reasoning as the /field Foreman home, just for
  // exceptions instead of assignments. ?all=1 opts back into the
  // company-wide scan (what ADMIN always sees — an owner legitimately
  // needs every project, not just the ones they personally PM).
  const isMyJobsView = session.role === "PM" && all !== "1";
  const items = isMyJobsView ? allItems.filter((i) => i.pmUserId === session.userId) : allItems;
  const critical = items.filter((i) => i.severity === "critical");
  const warning = items.filter((i) => i.severity === "warning");

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href={session.role === "PM" ? "/?view=command" : "/"} className="text-sm text-blue-600 hover:underline">
          &larr; Company command
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-2 mt-1">
          <h1 className="text-2xl font-semibold">{isMyJobsView ? "My action center" : "Company action center"}</h1>
          {session.role === "PM" && (
            <Link href={isMyJobsView ? "/today?all=1" : "/today"} className="text-sm text-blue-600 hover:underline">
              {isMyJobsView ? "Show every project →" : "Back to my jobs →"}
            </Link>
          )}
        </div>
        <p className="text-slate-500 text-sm mt-1">
          {isMyJobsView
            ? "Everything on your own projects that needs attention today"
            : "Everything across every project that needs attention today"}{" "}
          — what it is, why it matters, the impact of leaving it, what to do, who owns it, and when it&apos;s due.
          Deterministic, not AI-ranked: critical exceptions first, then everything else.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="text-slate-500 text-sm bg-white border rounded-lg p-6">
          {isMyJobsView
            ? "Nothing needs your attention on your projects right now — every one of them is clean."
            : "Nothing needs your attention right now — every job is clean."}
        </p>
      ) : (
        <div className="space-y-6">
          {[
            { label: "Critical — act today", list: critical },
            { label: "Warning", list: warning },
          ]
            .filter((g) => g.list.length > 0)
            .map((group) => (
              <div key={group.label} className="space-y-3">
                <h2 className="text-lg font-medium">
                  {group.label} <span className="text-slate-400 font-normal">({group.list.length})</span>
                </h2>
                <div className="space-y-3">
                  {group.list.map((item, i) => (
                    <div key={`${item.jobId}-${item.type}-${i}`} className="bg-white border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Link href={`/jobs/${item.jobId}`} className="font-medium text-sm hover:underline">
                            {item.jobTitle}
                          </Link>
                          <p className="text-sm mt-0.5">{item.message}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${SEVERITY_CLASSES[item.severity]}`}>
                          {ALERT_TYPE_LABEL[item.type]}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-t pt-3">
                        <div>
                          <div className="text-slate-400">Why it matters</div>
                          <div className="text-slate-600 mt-0.5">{item.why}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Impact if ignored</div>
                          <div className="text-slate-600 mt-0.5">{item.impact}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Owner</div>
                          <div className="text-slate-600 mt-0.5">{item.owner}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Due</div>
                          <div className="text-slate-600 mt-0.5">{item.dueLabel}</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 border-t pt-3">
                        <p className="text-xs text-slate-500">{item.action}</p>
                        <Link
                          href={item.actionHref}
                          className="flex-shrink-0 text-xs bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-700 whitespace-nowrap"
                        >
                          {item.actionLabel} &rarr;
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
