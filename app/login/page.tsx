import { login } from "@/lib/auth-actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">CrewSync</h1>
          <p className="text-slate-500 text-sm mt-1">Sign in to continue</p>
        </div>

        <form action={login} className="space-y-4 bg-white border rounded-lg p-6">
          {error && (
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
      </div>
    </div>
  );
}
