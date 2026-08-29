"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { generateApiKey } from "@/lib/api-key";
import { randomBytes } from "crypto";

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export async function createApiKey(formData: FormData) {
  const session = await requireRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);
  const name = str(formData, "name");
  if (!name) throw new Error("Name is required");

  const { plaintext, hash, prefix } = generateApiKey();
  await prisma.apiKey.create({ data: { companyId: session.companyId, name, keyHash: hash, keyPrefix: prefix } });

  revalidatePath("/settings/api-keys");
  redirect(`/settings/api-keys?created=${encodeURIComponent(plaintext)}`);
}

export async function revokeApiKey(formData: FormData) {
  const session = await requireRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);
  const id = str(formData, "id");
  if (!id) throw new Error("Key is required");

  await prisma.apiKey.update({ where: { id }, data: { active: false } });

  revalidatePath("/settings/api-keys");
  redirect("/settings/api-keys");
}

export async function createWebhook(formData: FormData) {
  const session = await requireRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);
  const url = str(formData, "url");
  const events = formData.getAll("events").filter((v): v is string => typeof v === "string");
  if (!url || events.length === 0) throw new Error("URL and at least one event are required");

  const secret = randomBytes(24).toString("base64url");
  await prisma.webhook.create({ data: { companyId: session.companyId, url, events: events as never, secret } });

  revalidatePath("/settings/webhooks");
  redirect(`/settings/webhooks?created=${encodeURIComponent(secret)}`);
}

export async function toggleWebhook(formData: FormData) {
  const session = await requireRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);
  const id = str(formData, "id");
  const active = formData.get("active") === "on";
  if (!id) throw new Error("Webhook is required");

  await prisma.webhook.update({ where: { id }, data: { active } });

  revalidatePath("/settings/webhooks");
  redirect("/settings/webhooks");
}
