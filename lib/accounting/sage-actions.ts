"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { signValue } from "@/lib/auth";
import { origin } from "@/lib/origin";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { buildSageAuthorizeUrl, isSageConfigured } from "@/lib/accounting/sage-oauth";
import { randomToken } from "@/lib/oidc";
import { SAGE_STATE_COOKIE, SAGE_STATE_MAX_AGE_SECONDS, type SageStatePayload } from "@/lib/accounting/sage-state";

/**
 * Admin-initiated: "Connect to Sage Intacct" on /settings/integrations.
 * Redirects to Sage's real authorization endpoint; the resulting per-company
 * access/refresh tokens land via app/api/integrations/sage/callback/route.ts.
 * The state cookie plays the same role as the SSO flow's (lib/sso-actions.ts)
 * — CSRF protection without server-side session storage.
 */
export async function startSageConnect() {
  const session = await requireRole("ADMIN");
  if (!isSageConfigured()) {
    throw new Error("Sage Intacct isn't configured for this app yet (SAGE_INTACCT_CLIENT_ID/SECRET missing).");
  }

  const redirectUri = `${await origin()}/api/integrations/sage/callback`;
  const state = randomToken();

  const payload: SageStatePayload = { companyId: session.companyId, state, redirectUri };
  const token = await signValue(payload);
  const store = await cookies();
  store.set(SAGE_STATE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SAGE_STATE_MAX_AGE_SECONDS,
  });

  await logAudit(session, {
    action: "integration_credential.connect_started",
    entityType: "IntegrationCredential",
    entityId: "SAGE",
    detail: "Sage Intacct",
  });

  redirect(buildSageAuthorizeUrl({ redirectUri, state }));
}

export async function disconnectSage() {
  const session = await requireRole("ADMIN");
  await prisma.integrationCredential.deleteMany({ where: { companyId: session.companyId, provider: "SAGE" } });
  await logAudit(session, {
    action: "integration_credential.removed",
    entityType: "IntegrationCredential",
    entityId: "SAGE",
    detail: "Sage Intacct",
  });
  redirect("/settings/integrations");
}
