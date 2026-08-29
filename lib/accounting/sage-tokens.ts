import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { refreshSageTokens, type SageTokens } from "@/lib/accounting/sage-oauth";

// IntegrationCredential isn't a tenant model in the scopedPrisma extension
// (companyId+provider is its own scoping key, not a list needing
// auto-filtering) — every query here filters by companyId explicitly.

export async function storeSageTokens(companyId: string, tokens: SageTokens): Promise<void> {
  const encryptedData = encryptSecret(JSON.stringify(tokens));
  await prisma.integrationCredential.upsert({
    where: { companyId_provider: { companyId, provider: "SAGE" } },
    update: { encryptedData, connected: true },
    create: { companyId, provider: "SAGE", encryptedData, connected: true },
  });
}

export async function getSageConnection(companyId: string): Promise<SageTokens | null> {
  const row = await prisma.integrationCredential.findFirst({ where: { companyId, provider: "SAGE" } });
  if (!row) return null;
  return JSON.parse(decryptSecret(row.encryptedData)) as SageTokens;
}

/** Returns a valid (non-expired) access token, refreshing and persisting a
 * new one first if the stored token is expired or about to be (60s
 * skew). Returns null if the company has never connected Sage. */
export async function getValidSageAccessToken(companyId: string): Promise<string | null> {
  const tokens = await getSageConnection(companyId);
  if (!tokens) return null;

  if (tokens.expiresAt > Date.now() + 60_000) {
    return tokens.accessToken;
  }

  const refreshed = await refreshSageTokens(tokens.refreshToken);
  await storeSageTokens(companyId, refreshed);
  return refreshed.accessToken;
}
