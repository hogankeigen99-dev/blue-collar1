import { headers } from "next/headers";

/** The app's own base URL, derived from request headers — used to build
 * OAuth redirect URIs that must match exactly what's registered with the
 * external provider (Sage, an SSO IdP, ...). */
export async function origin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return `${proto}://${host}`;
}
