"use server";

import { scopedPrisma } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { requireRole } from "@/lib/session";
import { signValue } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { buildAuthorizeUrl, generatePkcePair, randomToken } from "@/lib/oidc";
import { SSO_STATE_COOKIE, SSO_STATE_MAX_AGE_SECONDS, type SsoStatePayload } from "@/lib/sso";

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

async function origin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return `${proto}://${host}`;
}

export async function saveSsoConfig(formData: FormData) {
  const session = await requireRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);
  const issuerUrl = str(formData, "issuerUrl");
  const clientId = str(formData, "clientId");
  const clientSecret = str(formData, "clientSecret");
  const enabled = formData.get("enabled") === "on";

  if (enabled && (!issuerUrl || !clientId)) {
    throw new Error("Issuer URL and client ID are required to enable SSO");
  }

  const existing = await prisma.ssoConfig.findFirst({ where: { companyId: session.companyId } });

  await prisma.ssoConfig.upsert({
    where: { companyId: session.companyId },
    update: {
      issuerUrl: issuerUrl ?? existing?.issuerUrl ?? null,
      clientId: clientId ?? existing?.clientId ?? null,
      // Only overwrite the stored secret if a new one was entered — the
      // form never round-trips the existing plaintext, so a blank field
      // means "leave it as-is," not "clear it."
      clientSecretEncrypted: clientSecret ? encryptSecret(clientSecret) : existing?.clientSecretEncrypted ?? null,
      enabled,
    },
    create: {
      companyId: session.companyId,
      issuerUrl: issuerUrl ?? null,
      clientId: clientId ?? null,
      clientSecretEncrypted: clientSecret ? encryptSecret(clientSecret) : null,
      enabled,
    },
  });

  revalidatePath("/settings/sso");
  redirect("/settings/sso");
}

/**
 * The login page's "Sign in with SSO" step. Takes an email (the one place
 * besides password login that legitimately runs before we know the
 * caller's company), resolves it to a company + SsoConfig, and redirects to
 * the IdP's real authorization endpoint. PKCE + a signed, short-lived
 * state cookie stand in for server-side session storage (this app never
 * assumes a shared in-memory store between requests).
 */
export async function startSso(formData: FormData) {
  const email = str(formData, "email")?.toLowerCase();
  if (!email) redirect("/login?error=sso_email_required");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || user.authProvider !== "SSO") {
    redirect("/login?error=sso_no_account");
  }

  const config = await prisma.ssoConfig.findUnique({ where: { companyId: user.companyId } });
  if (!config?.enabled || !config.issuerUrl || !config.clientId) {
    redirect("/login?error=sso_not_configured");
  }

  const redirectUri = `${await origin()}/api/auth/sso/callback`;
  const state = randomToken();
  const nonce = randomToken();
  const { codeVerifier, codeChallenge } = generatePkcePair();

  const payload: SsoStatePayload = { companyId: user.companyId, state, nonce, codeVerifier, redirectUri };
  const token = await signValue(payload);
  const store = await cookies();
  store.set(SSO_STATE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SSO_STATE_MAX_AGE_SECONDS,
  });

  const authorizeUrl = await buildAuthorizeUrl(
    { issuerUrl: config.issuerUrl, clientId: config.clientId },
    { redirectUri, state, nonce, codeChallenge }
  );
  redirect(authorizeUrl);
}
