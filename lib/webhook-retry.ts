import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";

/** Minutes to wait before each retry, indexed by (attempt - 1) — attempt 1
 * is the initial delivery in dispatchWebhook, so this array covers
 * attempts 2 through MAX_ATTEMPTS. After the last entry is exhausted with
 * no success, the delivery is dead-lettered. */
const BACKOFF_MINUTES = [1, 5, 30, 120, 720]; // 1m, 5m, 30m, 2h, 12h
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1; // 6 total attempts

export function nextRetryDelayMinutes(attemptJustMade: number): number | null {
  return BACKOFF_MINUTES[attemptJustMade - 1] ?? null;
}

export async function attemptDelivery(
  url: string,
  secret: string,
  body: string
): Promise<{ statusCode: number | null; success: boolean }> {
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CrewSync-Signature": signature },
      body,
      signal: AbortSignal.timeout(5000),
    });
    return { statusCode: res.status, success: res.ok };
  } catch {
    return { statusCode: null, success: false };
  }
}

/**
 * Re-attempts every WebhookDelivery that's due for retry (nextRetryAt in
 * the past, not yet dead-lettered). This is a system/cron job, not a
 * user-scoped request — it has to look across every company's webhooks by
 * design, so it uses the raw (unscoped) client, same exception as
 * lib/api-key.ts's verifyApiKey. Nothing here is reachable without the
 * cron secret (app/api/cron/webhook-retries/route.ts).
 */
export async function processWebhookRetries(): Promise<{ attempted: number; succeeded: number; deadLettered: number }> {
  const due = await prisma.webhookDelivery.findMany({
    where: { success: false, deadLettered: false, nextRetryAt: { lte: new Date() } },
    include: { webhook: true },
    take: 200, // bound a single run — a runaway backlog shouldn't turn one cron tick into a huge batch
  });

  let succeeded = 0;
  let deadLettered = 0;

  for (const delivery of due) {
    if (!delivery.webhook.active) {
      // The endpoint was disabled since this delivery was queued — stop retrying it.
      await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { deadLettered: true, nextRetryAt: null } });
      deadLettered++;
      continue;
    }

    const result = await attemptDelivery(delivery.webhook.url, delivery.webhook.secret, delivery.payload);
    const attempt = delivery.attempt + 1;

    if (result.success) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { success: true, statusCode: result.statusCode, attempt, nextRetryAt: null },
      });
      succeeded++;
      continue;
    }

    const delayMinutes = nextRetryDelayMinutes(attempt);
    if (delayMinutes === null) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { statusCode: result.statusCode, attempt, deadLettered: true, nextRetryAt: null },
      });
      deadLettered++;
    } else {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { statusCode: result.statusCode, attempt, nextRetryAt: new Date(Date.now() + delayMinutes * 60_000) },
      });
    }
  }

  return { attempted: due.length, succeeded, deadLettered };
}
