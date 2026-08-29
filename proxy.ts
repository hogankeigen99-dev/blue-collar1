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
  matcher: ["/((?!login|api/v1|api/auth/sso|_next/static|_next/image|favicon.ico).*)"],
};
