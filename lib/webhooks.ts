import { scopedPrisma } from "@/lib/tenant";
import { attemptDelivery, nextRetryDelayMinutes } from "@/lib/webhook-retry";

/** Fires a webhook event to every active, subscribed endpoint belonging to
 * the triggering company. Best-effort: failures are recorded
 * (WebhookDelivery.success=false, with a backoff nextRetryAt so
 * lib/webhook-retry.ts's cron job picks it up) but never thrown — a slow
 * or dead customer endpoint should never break the action that triggered it. */
export async function dispatchWebhook(companyId: string, event: string, payload: Record<string, unknown>) {
  const prisma = scopedPrisma(companyId);
  const webhooks = await prisma.webhook.findMany({
    where: { active: true, events: { has: event as never } },
  });
  if (webhooks.length === 0) return;

  const body = JSON.stringify({ event, data: payload, sentAt: new Date().toISOString() });

  await Promise.all(
    webhooks.map(async (hook) => {
      const result = await attemptDelivery(hook.url, hook.secret, body);
      const attempt = 1;
      const delayMinutes = result.success ? null : nextRetryDelayMinutes(attempt);
      await prisma.webhookDelivery.create({
        data: {
          webhookId: hook.id,
          event: event as never,
          payload: body,
          statusCode: result.statusCode ?? undefined,
          success: result.success,
          attempt,
          nextRetryAt: delayMinutes !== null ? new Date(Date.now() + delayMinutes * 60_000) : null,
        },
      });
    })
  );
}
