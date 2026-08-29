// Shared constants/types between lib/accounting/sage-actions.ts (a "use
// server" file, which may only export async functions) and the Sage
// callback route.

export const SAGE_STATE_COOKIE = "cs_sage_connect_state";
export const SAGE_STATE_MAX_AGE_SECONDS = 300; // 5 minutes — long enough for the OAuth round trip, no longer

export type SageStatePayload = {
  companyId: string;
  state: string;
  redirectUri: string;
};
