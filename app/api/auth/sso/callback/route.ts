import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyValue, signSession, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth";
import { SSO_STATE_COOKIE, type SsoStatePayload } from "@/lib/sso";
import { decryptSecret } from "@/lib/crypto";
import { exchangeCodeForTokens, verifyIdToken } from "@/lib/oidc";

function errorRedirect(request: Request, reason: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const store = await cookies();
  const stateCookie = store.get(SSO_STATE_COOKIE)?.value;
  store.delete(SSO_STATE_COOKIE); // single use, regardless of outcome below

  const flow = await verifyValue<SsoStatePayload>(stateCookie);
  if (!flow) return errorRedirect(request, "sso_state_expired");

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");
  if (!code || !returnedState || returnedState !== flow.state) {
    return errorRedirect(request, "sso_state_mismatch");
  }

  const config = await prisma.ssoConfig.findUnique({ where: { companyId: flow.companyId } });
  if (!config?.enabled || !config.issuerUrl || !config.clientId || !config.clientSecretEncrypted) {
    return errorRedirect(request, "sso_not_configured");
  }

  let sub: string;
  let email: string | null;
  try {
    const { idToken } = await exchangeCodeForTokens(
      { issuerUrl: config.issuerUrl, clientId: config.clientId, clientSecret: decryptSecret(config.clientSecretEncrypted) },
      { code, codeVerifier: flow.codeVerifier, redirectUri: flow.redirectUri }
    );
    const verified = await verifyIdToken({ issuerUrl: config.issuerUrl, clientId: config.clientId }, idToken, flow.nonce);
    sub = verified.sub;
    email = verified.email;
  } catch (err) {
    console.error("SSO callback failed:", err);
    return errorRedirect(request, "sso_verification_failed");
  }

  // Just-in-time linking, never auto-provisioning: the account must already
  // exist (an admin created it at /settings/users with authProvider=SSO) —
  // an arbitrary IdP token can never mint itself a fresh account or role
  // here. First match by an already-linked ssoSubject; otherwise link by
  // email on first sign-in and persist the subject for next time.
  let user = await prisma.user.findFirst({
    where: { companyId: flow.companyId, authProvider: "SSO", ssoSubject: sub },
  });
  if (!user && email) {
    const byEmail = await prisma.user.findFirst({
      where: { companyId: flow.companyId, authProvider: "SSO", email, ssoSubject: null },
    });
    if (byEmail) {
      user = await prisma.user.update({ where: { id: byEmail.id }, data: { ssoSubject: sub } });
    }
  }

  if (!user || !user.active) {
    return errorRedirect(request, "sso_no_account");
  }

  const token = await signSession({
    userId: user.id,
    companyId: user.companyId,
    name: user.name,
    email: user.email,
    role: user.role,
  });
  store.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);

  return NextResponse.redirect(new URL("/", request.url));
}
