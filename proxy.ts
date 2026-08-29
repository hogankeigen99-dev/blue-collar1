import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // /api/v1/* authenticates itself via a Bearer API key, not the session
  // cookie. /api/auth/sso/* runs before a session cookie exists — the SSO
  // callback route is what CREATES it (lib/sso-actions.ts, app/api/auth/sso/callback).
  // /api/cron/* is hit by a scheduler, not a signed-in browser — it
  // authenticates itself via CRON_SECRET (lib/webhook-retry.ts).
  // /api/integrations/sage/callback trusts its own signed state cookie
  // (lib/accounting/sage-state.ts) rather than depending on the admin's
  // session surviving the external OAuth redirect back from Sage.
  matcher: ["/((?!login|api/v1|api/auth/sso|api/cron|api/integrations/sage|_next/static|_next/image|favicon.ico).*)"],
};
