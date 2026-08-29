import { createHmac } from "crypto";
import { scopedPrisma } from "@/lib/tenant";

/** Fires a webhook event to every active, subscribed endpoint belonging to
 * the triggering company. Best-effort: failures are recorded
 * (WebhookDelivery.success=false) but never thrown — a slow or dead
 * customer endpoint should never break the action that triggered it. */
export async function dispatchWebhook(companyId: string, event: string, payload: Record<string, unknown>) {
  const prisma = scopedPrisma(companyId);
  const webhooks = await prisma.webhook.findMany({
    where: { active: true, events: { has: event as never } },
  });
  if (webhooks.length === 0) return;

  const body = JSON.stringify({ event, data: payload, sentAt: new Date().toISOString() });

  await Promise.all(
    webhooks.map(async (hook) => {
      const signature = createHmac("sha256", hook.secret).update(body).digest("hex");
      let statusCode: number | null = null;
      let success = false;
      try {
        const res = await fetch(hook.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CrewSync-Signature": signature },
          body,
          signal: AbortSignal.timeout(5000),
        });
        statusCode = res.status;
        success = res.ok;
      } catch {
        success = false;
      }
      await prisma.webhookDelivery.create({
        data: { webhookId: hook.id, event: event as never, payload: body, statusCode: statusCode ?? undefined, success },
      });
    })
  );
}
