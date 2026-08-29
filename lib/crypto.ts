import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

// AES-256-GCM at rest for anything we can't store in plaintext: SSO client
// secrets and third-party integration credentials (lib/tenant.ts's
// SsoConfig/IntegrationCredential models). Node crypto only — this module
// is never imported from proxy.ts (Edge runtime), same reasoning as
// lib/password.ts.

function encryptionKey(): Buffer {
  const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and add it to your .env."
    );
  }
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 of a 256-bit key).");
  }
  return buf;
}

/** Encrypts a secret for storage. Returns "iv:authTag:ciphertext", each base64url. */
export function encryptSecret(plaintext: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12); // GCM's recommended IV size
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64url")).join(":");
}

/** Decrypts a value produced by encryptSecret. Throws if the ciphertext was tampered with. */
export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, ciphertextB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted value — expected iv:authTag:ciphertext");
  }
  const key = encryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
