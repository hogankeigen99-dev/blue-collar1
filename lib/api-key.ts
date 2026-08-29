import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";

const KEY_PREFIX = "csk_";

/** Generates a new API key. Returns the plaintext (shown to the user exactly
 * once) plus the hash/prefix that get stored — the plaintext is never
 * persisted, same principle as a password. */
export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const plaintext = KEY_PREFIX + randomBytes(24).toString("base64url");
  const hash = createHash("sha256").update(plaintext).digest("hex");
  const prefix = plaintext.slice(0, 12);
  return { plaintext, hash, prefix };
}

/** Verifies a bearer token against stored API keys, returning the matching key row
 * (and bumping lastUsedAt) or null. This is the one place besides login that
 * legitimately runs before we know which company the caller belongs to — the
 * key itself is how the company is discovered — so it uses the raw (unscoped)
 * client. Callers MUST use the returned key's companyId to scope every query
 * that follows. */
export async function verifyApiKey(token: string) {
  if (!token.startsWith(KEY_PREFIX)) return null;
  const hash = createHash("sha256").update(token).digest("hex");
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hash } });
  if (!key || !key.active) return null;

  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return key;
}
