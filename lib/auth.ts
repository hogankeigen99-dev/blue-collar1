// Session token signing/verification — Web Crypto only (no node:crypto), so
// this module is safe to import from middleware (Edge runtime) as well as
// from Server Actions and Server Components (Node runtime).

export type Role = "ADMIN" | "PM" | "FOREMAN";

export type SessionPayload = {
  userId: string;
  companyId: string;
  name: string;
  email: string;
  role: Role;
};

export const SESSION_COOKIE = "cs_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. Add a long random string to your .env (see .env.example)."
    );
  }
  return secret;
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const key = await hmacKey();
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${base64url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  try {
    const key = await hmacKey();
    const signature = Buffer.from(sig, "base64url");
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(body)
    );
    if (!valid) return null;
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};

export function canManageEstimates(role: Role): boolean {
  return role === "ADMIN" || role === "PM";
}

export function canManageJobs(role: Role): boolean {
  return role === "ADMIN" || role === "PM";
}
