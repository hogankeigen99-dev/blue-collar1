import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken, type Role, type SessionPayload } from "@/lib/auth";

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** For use at the top of a page/layout — redirects to /login if not signed in. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** For use inside a Server Action — the UI may hide the control, but the action must still refuse it server-side. */
export async function requireRole(...roles: Role[]): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!roles.includes(session.role)) {
    throw new Error(`Forbidden: requires ${roles.join(" or ")} role`);
  }
  return session;
}

/** For use at the top of a page reachable only by certain roles — bounces to the dashboard instead of erroring. */
export async function requirePageRole(...roles: Role[]): Promise<SessionPayload> {
  const session = await requireSession();
  if (!roles.includes(session.role)) redirect("/");
  return session;
}
