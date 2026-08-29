import { scopedPrisma } from "@/lib/tenant";
import { saveSsoConfig } from "@/lib/sso-actions";
import { requirePageRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SsoSettingsPage() {
  const session = await requirePageRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);

  // SsoConfig isn't a tenant model in the scopedPrisma extension (it's a
  // 1:1 with Company, not a list that needs auto-filtering) — the companyId
  // filter here is explicit and load-bearing.
  const config = await prisma.ssoConfig.findFirst({ where: { companyId: session.companyId } });

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">SSO</h1>
        <p className="text-slate-500 text-sm mt-1">
          Connect your identity provider (Okta, Azure AD/Entra, Google Workspace, or any
          standard OIDC provider) so <code className="bg-slate-100 px-1 rounded">SSO</code>-type
          users at{" "}
          <a href="/settings/users" className="text-blue-600 hover:underline">/settings/users</a>{" "}
          can sign in with it instead of a password. The provisioned account is matched by
          email on first sign-in, not created from thin air — an IdP token alone never grants
          access to an account nobody set up here.
        </p>
      </div>

      <form action={saveSsoConfig} className="space-y-4 bg-white border rounded-lg p-6">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="enabled" defaultChecked={config?.enabled ?? false} />
          Enable SSO for this company
        </label>

        <div>
          <label className="block text-sm font-medium mb-1">Issuer URL *</label>
          <p className="text-xs text-slate-500 mb-1">
            Must serve standard OIDC discovery at{" "}
            <code className="bg-slate-100 px-1 rounded">/.well-known/openid-configuration</code>.
          </p>
          <input
            name="issuerUrl"
            type="url"
            defaultValue={config?.issuerUrl ?? ""}
            placeholder="https://your-idp.example.com"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Client ID *</label>
          <input
            name="clientId"
            defaultValue={config?.clientId ?? ""}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Client secret</label>
          <p className="text-xs text-slate-500 mb-1">
            {config?.clientSecretEncrypted
              ? "A secret is already saved — leave blank to keep it, or enter a new one to replace it."
              : "Encrypted at rest before it's stored (lib/crypto.ts)."}
          </p>
          <input
            name="clientSecret"
            type="password"
            placeholder={config?.clientSecretEncrypted ? "•••••••••••• (unchanged)" : ""}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>

        <p className="text-xs text-slate-500">
          Redirect URI to register with your IdP:{" "}
          <code className="bg-slate-100 px-1 rounded break-all">{"{this app's URL}"}/api/auth/sso/callback</code>
        </p>

        <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
          Save
        </button>
      </form>
    </div>
  );
}
