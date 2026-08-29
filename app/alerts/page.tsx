import Link from "next/link";
import { getAlerts, ALERT_TYPE_LABEL } from "@/lib/alerts";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const SEVERITY_CLASSES: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  warning: "bg-amber-100 text-amber-700",
};

export default async function AlertsPage() {
  const session = await requireSession();
  const alerts = await getAlerts(session.companyId);
  const critical = alerts.filter((a) => a.severity === "critical");
  const warning = alerts.filter((a) => a.severity === "warning");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Exception alerts</h1>
        <p className="text-slate-500 text-sm mt-1">
          Labor overruns, schedule risk, missing field reports, material risk, crew
          conflicts, unapproved change work, billing blockers, and margin risk — across
          every job, scanned live.
        </p>
      </div>

      {alerts.length === 0 ? (
        <p className="text-slate-500 text-sm">No exceptions right now.</p>
      ) : (
        <div className="space-y-6">
          {[
            { label: "Critical", items: critical },
            { label: "Warning", items: warning },
          ]
            .filter((g) => g.items.length > 0)
            .map((group) => (
              <div key={group.label} className="space-y-3">
                <h2 className="text-lg font-medium">
                  {group.label} <span className="text-slate-400 font-normal">({group.items.length})</span>
                </h2>
                <div className="bg-white border rounded-lg divide-y">
                  {group.items.map((a, i) => (
                    <Link
                      key={`${a.jobId}-${a.type}-${i}`}
                      href={`/jobs/${a.jobId}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
                    >
                      <div>
                        <div className="font-medium text-sm">{a.jobTitle}</div>
                        <div className="text-sm text-slate-500">{a.message}</div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${SEVERITY_CLASSES[a.severity]}`}>
                        {ALERT_TYPE_LABEL[a.type]}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
