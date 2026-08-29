import { scopedPrisma } from "@/lib/tenant";
import { createWebhook, toggleWebhook } from "@/lib/settings-actions";
import { requirePageRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const EVENTS = ["JOB_STAGE_CHANGED", "CHANGE_ORDER_APPROVED", "INVOICE_SENT", "DAILY_REPORT_SUBMITTED"] as const;
const EVENT_LABEL: Record<string, string> = {
  JOB_STAGE_CHANGED: "Job stage changed",
  CHANGE_ORDER_APPROVED: "Change order approved",
  INVOICE_SENT: "Invoice sent",
  DAILY_REPORT_SUBMITTED: "Daily report submitted",
};

export default async function WebhooksPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const session = await requirePageRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);
  const { created } = await searchParams;
  const webhooks = await prisma.webhook.findMany({
    orderBy: { createdAt: "desc" },
    include: { deliveries: { orderBy: { createdAt: "desc" }, take: 5 } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Webhooks</h1>
        <p className="text-slate-500 text-sm mt-1">
          POST a JSON payload to your endpoint when one of these events happens, signed with
          an HMAC-SHA256 in the <code className="bg-slate-100 px-1 rounded">X-CrewSync-Signature</code> header.
        </p>
      </div>

      {created && (
        <div className="text-sm bg-green-50 border border-green-200 text-green-800 rounded-md px-4 py-3">
          <div className="font-medium">Webhook created — copy the signing secret now, it won&apos;t be shown again:</div>
          <code className="block mt-2 bg-white border rounded px-3 py-2 text-xs break-all">{created}</code>
        </div>
      )}

      <form action={createWebhook} className="space-y-3 bg-white border rounded-lg p-4">
        <div>
          <label className="block text-xs font-medium mb-1">Endpoint URL</label>
          <input name="url" type="url" required placeholder="https://…" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Events</label>
          <div className="flex flex-wrap gap-3">
            {EVENTS.map((e) => (
              <label key={e} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="events" value={e} />
                {EVENT_LABEL[e]}
              </label>
            ))}
          </div>
        </div>
        <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
          Create webhook
        </button>
      </form>

      {webhooks.length === 0 ? (
        <p className="text-slate-500 text-sm">No webhooks yet.</p>
      ) : (
        <div className="space-y-3">
          {webhooks.map((w) => (
            <div key={w.id} className="bg-white border rounded-lg p-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium break-all">{w.url}</div>
                  <div className="text-xs text-slate-500">{w.events.map((e) => EVENT_LABEL[e]).join(", ")}</div>
                </div>
                <form action={toggleWebhook}>
                  <input type="hidden" name="id" value={w.id} />
                  <input type="hidden" name="active" value={w.active ? "" : "on"} />
                  <button type="submit" className={`text-xs px-2 py-1 rounded-full ${w.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {w.active ? "Active" : "Paused"}
                  </button>
                </form>
              </div>
              {w.deliveries.length > 0 && (
                <div className="border-t pt-2 space-y-1">
                  <div className="text-xs text-slate-400">Recent deliveries</div>
                  {w.deliveries.map((d) => (
                    <div key={d.id} className="text-xs flex items-center justify-between">
                      <span>
                        {EVENT_LABEL[d.event]} · {new Date(d.createdAt).toLocaleString()}
                      </span>
                      <span className={d.success ? "text-green-600" : "text-red-600"}>
                        {d.success ? `OK (${d.statusCode})` : `Failed${d.statusCode ? ` (${d.statusCode})` : ""}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
