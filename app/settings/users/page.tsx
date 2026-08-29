import { scopedPrisma } from "@/lib/tenant";
import { createUser, toggleUserActive, resetUserPassword } from "@/lib/user-actions";
import { requirePageRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "PM", "FOREMAN"] as const;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ tempPassword?: string }>;
}) {
  const session = await requirePageRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);
  const { tempPassword } = await searchParams;

  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-slate-500 text-sm mt-1">
          Login accounts for this company — distinct from Workers, which are labor
          resources with no login. An SSO account needs no password: it&apos;s linked to
          your identity provider by email the first time that person signs in via{" "}
          <a href="/settings/sso" className="text-blue-600 hover:underline">SSO</a>.
        </p>
      </div>

      {tempPassword && (
        <div className="text-sm bg-green-50 border border-green-200 text-green-800 rounded-md px-4 py-3">
          <div className="font-medium">Temporary password &mdash; copy it now, it won&apos;t be shown again:</div>
          <code className="block mt-2 bg-white border rounded px-3 py-2 text-xs break-all">{tempPassword}</code>
        </div>
      )}

      <form action={createUser} className="space-y-4 bg-white border rounded-lg p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input name="name" required className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email *</label>
            <input name="email" type="email" required className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Role *</label>
            <select name="role" required className="w-full border rounded-md px-3 py-2 text-sm">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Sign-in method *</label>
            <select name="authProvider" required className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="PASSWORD">Password</option>
              <option value="SSO">SSO</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Temporary password</label>
          <p className="text-xs text-slate-500 mb-1">Only used for password sign-in — leave blank for SSO.</p>
          <input name="password" type="text" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
          Add user
        </button>
      </form>

      <div className="bg-white border rounded-lg divide-y">
        {users.map((u) => (
          <div key={u.id} className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
            <div>
              <div className="font-medium">
                {u.name} <span className="text-slate-400 font-normal">({u.role})</span>
              </div>
              <div className="text-xs text-slate-500">
                {u.email} · {u.authProvider === "SSO" ? "SSO" : "Password"}
                {!u.active && " · inactive"}
                {u.authProvider === "SSO" && !u.ssoSubject && " · not yet linked"}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {u.authProvider === "PASSWORD" && (
                <form action={resetUserPassword}>
                  <input type="hidden" name="id" value={u.id} />
                  <button type="submit" className="px-2 py-1 rounded-md border hover:bg-slate-50">
                    Reset password
                  </button>
                </form>
              )}
              <form action={toggleUserActive}>
                <input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="active" value={u.active ? "" : "on"} />
                <button
                  type="submit"
                  className={`px-2 py-1 rounded-full ${u.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}
                >
                  {u.active ? "Active" : "Inactive"}
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
