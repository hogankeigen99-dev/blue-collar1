"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { encryptSecret } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

/**
 * Stores OAuth-style credentials for a third-party integration, encrypted
 * at rest. Deliberately never sets `connected: true` here — that would
 * claim a working connection this code never actually verified (we have no
 * real Autodesk/BuildingConnected/accounting API access to round-trip
 * against yet). A future integration phase that actually calls the
 * provider's API is what earns that flag.
 */
export async function saveIntegrationCredential(formData: FormData) {
  const session = await requireRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);
  const provider = str(formData, "provider");
  const clientId = str(formData, "clientId");
  const clientSecret = str(formData, "clientSecret");
  if (!provider || !clientId || !clientSecret) {
    throw new Error("Provider, client ID, and client secret are required");
  }

  const encryptedData = encryptSecret(JSON.stringify({ clientId, clientSecret }));

  // IntegrationCredential isn't a tenant model in the scopedPrisma
  // extension (it's keyed by companyId+provider, not a list needing
  // auto-filtering) — the companyId here is explicit and load-bearing.
  await prisma.integrationCredential.upsert({
    where: { companyId_provider: { companyId: session.companyId, provider: provider as never } },
    update: { encryptedData },
    create: { companyId: session.companyId, provider: provider as never, encryptedData },
  });
  await logAudit(session, {
    action: "integration_credential.saved",
    entityType: "IntegrationCredential",
    entityId: provider,
    detail: provider,
  });

  revalidatePath("/settings/integrations");
  redirect("/settings/integrations");
}

export async function disconnectIntegration(formData: FormData) {
  const session = await requireRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);
  const provider = str(formData, "provider");
  if (!provider) throw new Error("Provider is required");

  await prisma.integrationCredential.deleteMany({
    where: { companyId: session.companyId, provider: provider as never },
  });
  await logAudit(session, {
    action: "integration_credential.removed",
    entityType: "IntegrationCredential",
    entityId: provider,
    detail: provider,
  });

  revalidatePath("/settings/integrations");
  redirect("/settings/integrations");
}
