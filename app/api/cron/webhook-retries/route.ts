import { NextResponse } from "next/server";
import { processWebhookRetries } from "@/lib/webhook-retry";

/**
 * Meant to be hit on a schedule (every few minutes) by Railway cron,
 * GitHub Actions, or any scheduler that can send an authenticated HTTP
 * request — this route itself does the work, it doesn't schedule anything.
 * Protected by a shared secret rather than a session, since nothing human
 * is signed in when a cron job fires this.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processWebhookRetries();
  return NextResponse.json(result);
}
