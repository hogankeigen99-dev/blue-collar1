// Sage Intacct REST API v1 OAuth 2.0 (authorization code grant). Endpoints
// verified against Sage's own documentation search results — developer.sage.com
// itself is unreachable from this environment's network egress, so these
// were confirmed via search rather than a direct fetch of the OpenAPI spec:
//   - authorize: https://api.intacct.com/ia/api/v1/oauth2/authorize
//   - token:     https://api.intacct.com/ia/api/v1/oauth2/token
// The client ID/secret are registered ONCE by CrewSync itself in the Sage
// Developer Portal (SAGE_INTACCT_CLIENT_ID/SECRET env vars) — they identify
// this app, not any one customer. Each company's admin then completes this
// flow to grant CrewSync access to THEIR Sage Intacct company; the resulting
// access/refresh tokens are what's stored per-company (IntegrationCredential).

const AUTHORIZE_URL = "https://api.intacct.com/ia/api/v1/oauth2/authorize";
const TOKEN_URL = "https://api.intacct.com/ia/api/v1/oauth2/token";

export type SageTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
};

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.SAGE_INTACCT_CLIENT_ID;
  const clientSecret = process.env.SAGE_INTACCT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "SAGE_INTACCT_CLIENT_ID / SAGE_INTACCT_CLIENT_SECRET are not set. Register an app at the Sage Developer Portal (developer.sage.com/intacct) and add them to .env."
    );
  }
  return { clientId, clientSecret };
}

export function isSageConfigured(): boolean {
  return Boolean(process.env.SAGE_INTACCT_CLIENT_ID && process.env.SAGE_INTACCT_CLIENT_SECRET);
}

export function buildSageAuthorizeUrl(params: { redirectUri: string; state: string }): string {
  const { clientId } = credentials();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  return url.toString();
}

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number };

export async function exchangeSageCode(params: { code: string; redirectUri: string }): Promise<SageTokens> {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    throw new Error(`Sage Intacct token exchange failed: HTTP ${res.status} — ${await res.text()}`);
  }
  const body = (await res.json()) as TokenResponse;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
}

export async function refreshSageTokens(refreshToken: string): Promise<SageTokens> {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    throw new Error(`Sage Intacct token refresh failed: HTTP ${res.status} — ${await res.text()}`);
  }
  const body = (await res.json()) as TokenResponse;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
}
