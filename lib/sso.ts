// Shared constants/types between lib/sso-actions.ts (a "use server" file,
// which may only export async functions) and the SSO callback route.

export const SSO_STATE_COOKIE = "cs_sso_state";
export const SSO_STATE_MAX_AGE_SECONDS = 300; // 5 minutes — long enough to complete the IdP round trip, no longer

export type SsoStatePayload = {
  companyId: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
};
