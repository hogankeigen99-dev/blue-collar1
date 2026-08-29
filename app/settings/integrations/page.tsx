import { scopedPrisma } from "@/lib/tenant";
import { saveIntegrationCredential, disconnectIntegration } from "@/lib/integration-actions";
import { startSageConnect, disconnectSage } from "@/lib/accounting/sage-actions";
import { isSageConfigured } from "@/lib/accounting/sage-oauth";
import { requirePageRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const PROVIDERS = ["AUTODESK", "BUILDINGCONNECTED", "QUICKBOOKS", "SAGE", "FOUNDATION"] as const;
const PROVIDER_LABEL: Record<string, string> = {
  AUTODESK: "Autodesk Construction Cloud",
  BUILDINGCONNECTED: "BuildingConnected",
  QUICKBOOKS: "QuickBooks",
  SAGE: "Sage Intacct",
  FOUNDATION: "Foundation",
};

const SAGE_ERROR_LABEL: Record<string, string> = {
  sage_state_expired: "That connection attempt expired — try connecting again.",
  sage_state_mismatch: "That connection link was invalid — try connecting again.",
  sage_connect_failed: "Sage rejected the connection. Check the app's SAGE_INTACCT_CLIENT_ID/SECRET and try again.",
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const session = await requirePageRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);
  const { error, connected } = await searchParams;

  // IntegrationCredential isn't a tenant model — the companyId filter here
  // is explicit and load-bearing, same reasoning as SsoConfig.
  const credentials = await prisma.integrationCredential.findMany({ where: { companyId: session.companyId } });
  const byProvider = Object.fromEntries(credentials.map((c) => [c.provider, c]));
  const sageConfigured = isSageConfigured();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-slate-500 text-sm mt-1">
          Sage Intacct connects via real OAuth 2.0 — the button below redirects to Sage,
          and a genuinely successful connection is what turns its status to
          &quot;Connected.&quot; The other providers below are credential-storage
          scaffolding only (encrypted at rest, <code className="bg-slate-100 px-1 rounded">lib/crypto.ts</code>,
          AES-256-GCM) — saving a client ID/secret there doesn&apos;t connect anything yet, since
          those API integrations haven&apos;t been built.
        </p>
      </div>

      {error && SAGE_ERROR_LABEL[error] && (
        <div className="text-sm bg-red-50 border border-red-200 text-red-800 rounded-md px-4 py-3">
          {SAGE_ERROR_LABEL[error]}
        </div>
      )}
      {connected === "SAGE" && (
        <div className="text-sm bg-green-50 border border-green-200 text-green-800 rounded-md px-4 py-3">
          Sage Intacct connected. Job pages now show a &quot;Push to Sage Intacct&quot; action
          alongside the CSV export.
        </div>
      )}

      <div className="bg-white border rounded-lg divide-y">
        {PROVIDERS.map((p) => {
          if (p === "SAGE") {
            const sageCred = byProvider.SAGE;
            const reallyConnected = Boolean(sageCred?.connected);
            return (
              <div key={p} className="px-4 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">{PROVIDER_LABEL[p]}</div>
                  <span className={`text-xs px-2 py-1 rounded-full ${reallyConnected ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {reallyConnected ? "Connected" : "Not connected"}
                  </span>
                </div>
                {!sageConfigured ? (
                  <p className="text-xs text-slate-500">
                    This app isn&apos;t registered with Sage yet — set{" "}
                    <code className="bg-slate-100 px-1 rounded">SAGE_INTACCT_CLIENT_ID</code> and{" "}
                    <code className="bg-slate-100 px-1 rounded">SAGE_INTACCT_CLIENT_SECRET</code> from a Sage
                    Developer Portal app registration.
                  </p>
                ) : reallyConnected ? (
                  <form action={disconnectSage}>
                    <button type="submit" className="text-xs text-red-600 hover:underline">
                      Disconnect
                    </button>
                  </form>
                ) : (
                  <form action={startSageConnect}>
                    <button type="submit" className="bg-slate-900 text-white text-xs px-3 py-1.5 rounded-md hover:bg-slate-700">
                      Connect to Sage Intacct
                    </button>
                  </form>
                )}
              </div>
            );
          }

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
