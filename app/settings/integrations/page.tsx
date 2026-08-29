import { scopedPrisma } from "@/lib/tenant";
import { saveIntegrationCredential, disconnectIntegration } from "@/lib/integration-actions";
import { requirePageRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const PROVIDERS = ["AUTODESK", "BUILDINGCONNECTED", "QUICKBOOKS", "SAGE", "FOUNDATION"] as const;
const PROVIDER_LABEL: Record<string, string> = {
  AUTODESK: "Autodesk Construction Cloud",
  BUILDINGCONNECTED: "BuildingConnected",
  QUICKBOOKS: "QuickBooks",
  SAGE: "Sage",
  FOUNDATION: "Foundation",
};

export default async function IntegrationsPage() {
  const session = await requirePageRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);

  // IntegrationCredential isn't a tenant model — the companyId filter here
  // is explicit and load-bearing, same reasoning as SsoConfig.
  const credentials = await prisma.integrationCredential.findMany({ where: { companyId: session.companyId } });
  const byProvider = Object.fromEntries(credentials.map((c) => [c.provider, c]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-slate-500 text-sm mt-1">
          Store OAuth credentials for third-party systems, encrypted at rest
          (<code className="bg-slate-100 px-1 rounded">lib/crypto.ts</code>, AES-256-GCM). Saving
          credentials here does not connect anything yet — the actual Autodesk /
          BuildingConnected / accounting sync is a later phase that calls each
          provider&apos;s API; this is the credential-storage foundation it will build on.
        </p>
      </div>

      <div className="bg-white border rounded-lg divide-y">
        {PROVIDERS.map((p) => {
          const cred = byProvider[p];
          return (
            <div key={p} className="px-4 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm">{PROVIDER_LABEL[p]}</div>
                <span className={`text-xs px-2 py-1 rounded-full ${cred ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                  {cred ? "Credentials saved — unverified" : "Not connected"}
                </span>
              </div>

              <form action={saveIntegrationCredential} className="flex flex-wrap items-end gap-2 text-xs">
                <input type="hidden" name="provider" value={p} />
                <div>
                  <label className="block mb-1">Client ID</label>
                  <input name="clientId" className="border rounded-md px-2 py-1 w-48" />
                </div>
                <div>
                  <label className="block mb-1">Client secret</label>
                  <input name="clientSecret" type="password" className="border rounded-md px-2 py-1 w-48" />
                </div>
                <button type="submit" className="bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-700">
                  Save
                </button>
              </form>

              {cred && (
                <form action={disconnectIntegration}>
                  <input type="hidden" name="provider" value={p} />
                  <button type="submit" className="text-xs text-red-600 hover:underline">
                    Remove credentials
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
