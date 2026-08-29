import { login } from "@/lib/auth-actions";
import { startSso } from "@/lib/sso-actions";

const SSO_ERROR_LABEL: Record<string, string> = {
  sso_email_required: "Enter your email to sign in with SSO.",
  sso_no_account: "No SSO account is set up for that email. Ask your admin to add one at Settings → Users.",
  sso_not_configured: "SSO isn't configured for that company yet.",
  sso_state_expired: "That sign-in link expired — try SSO again.",
  sso_state_mismatch: "That sign-in link is invalid — try SSO again.",
  sso_verification_failed: "Your identity provider couldn't be verified — try again or contact your admin.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const ssoError = error ? SSO_ERROR_LABEL[error] : undefined;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">CrewSync</h1>
          <p className="text-slate-500 text-sm mt-1">Sign in to continue</p>
        </div>

        <form action={login} className="space-y-4 bg-white border rounded-lg p-6">
          {error && !ssoError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              Invalid email or password.
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              name="email"
              type="email"
              required
              autoFocus
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              name="password"
              type="password"
              required
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
          >
            Sign in
          </button>
        </form>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <div className="flex-1 border-t" />
          or
          <div className="flex-1 border-t" />
        </div>

        <form action={startSso} className="space-y-3 bg-white border rounded-lg p-6">
          {ssoError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {ssoError}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Sign in with SSO</label>
            <input
              name="email"
              type="email"
              placeholder="you@yourcompany.com"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-white border text-sm px-4 py-2 rounded-md hover:bg-slate-50"
          >
            Continue with SSO
          </button>
        </form>
      </div>
    </div>
  );
}
