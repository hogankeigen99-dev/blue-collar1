import { randomBytes, createHash } from "crypto";
import { jwtVerify, createRemoteJWKSet } from "jose";

// A real OIDC authorization-code-flow implementation (with PKCE) — not a
// stub. A customer's IdP just needs its issuer URL to conform to standard
// OIDC discovery, which any compliant provider (Okta, Azure AD/Entra,
// Google Workspace, etc.) does.

export type OidcConfig = {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
};

type Discovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
};

const discoveryCache = new Map<string, Discovery>();

async function discover(issuerUrl: string): Promise<Discovery> {
  const cached = discoveryCache.get(issuerUrl);
  if (cached) return cached;

  const base = issuerUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/.well-known/openid-configuration`);
  if (!res.ok) {
    throw new Error(`OIDC discovery failed for ${issuerUrl}: HTTP ${res.status}`);
  }
  const doc = (await res.json()) as Discovery;
  discoveryCache.set(issuerUrl, doc);
  return doc;
}

export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function randomToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function buildAuthorizeUrl(
  config: Pick<OidcConfig, "issuerUrl" | "clientId">,
  params: { redirectUri: string; state: string; nonce: string; codeChallenge: string }
): Promise<string> {
  const discovery = await discover(config.issuerUrl);
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeCodeForTokens(
  config: OidcConfig,
  params: { code: string; codeVerifier: string; redirectUri: string }
): Promise<{ idToken: string }> {
  const discovery = await discover(config.issuerUrl);
  const res = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code_verifier: params.codeVerifier,
    }),
  });
  if (!res.ok) {
    throw new Error(`OIDC token exchange failed: HTTP ${res.status} — ${await res.text()}`);
  }
  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) throw new Error("OIDC token response had no id_token");
  return { idToken: body.id_token };
}

export async function verifyIdToken(
  config: Pick<OidcConfig, "issuerUrl" | "clientId">,
  idToken: string,
  expectedNonce: string
): Promise<{ sub: string; email: string | null }> {
  const discovery = await discover(config.issuerUrl);
  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: discovery.issuer,
    audience: config.clientId,
  });
  if (payload.nonce !== expectedNonce) {
    throw new Error("OIDC id_token nonce mismatch — possible replay");
  }
  if (typeof payload.sub !== "string") {
    throw new Error("OIDC id_token missing sub claim");
  }
  return { sub: payload.sub, email: typeof payload.email === "string" ? payload.email : null };
}
