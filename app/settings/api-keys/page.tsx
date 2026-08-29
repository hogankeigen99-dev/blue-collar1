import { prisma } from "@/lib/prisma";
import { createApiKey, revokeApiKey } from "@/lib/settings-actions";
import { requirePageRole } from "@/lib/session";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  await requirePageRole("ADMIN");
  const { created } = await searchParams;
  const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">API keys</h1>
        <p className="text-slate-500 text-sm mt-1">
          Server-to-server access to the read API (<code className="bg-slate-100 px-1 rounded">/api/v1/*</code>) via a{" "}
          <code className="bg-slate-100 px-1 rounded">Bearer</code> token.
        </p>
      </div>

      {created && (
        <div className="text-sm bg-green-50 border border-green-200 text-green-800 rounded-md px-4 py-3">
          <div className="font-medium">Key created — copy it now, it won&apos;t be shown again:</div>
          <code className="block mt-2 bg-white border rounded px-3 py-2 text-xs break-all">{created}</code>
        </div>
      )}

      <form action={createApiKey} className="flex items-end gap-2 bg-white border rounded-lg p-4">
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1">Name</label>
          <input name="name" required placeholder="e.g. Accounting sync" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
          Create key
        </button>
      </form>

      {keys.length === 0 ? (
        <p className="text-slate-500 text-sm">No API keys yet.</p>
      ) : (
        <div className="bg-white border rounded-lg divide-y">
          {keys.map((k) => (
            <div key={k.id} className="px-4 py-3 flex items-center justify-between text-sm">
              <div>
                <div className="font-medium">{k.name}</div>
                <div className="text-xs text-slate-500">
                  {k.keyPrefix}… · created {formatDate(k.createdAt)}
                  {k.lastUsedAt ? ` · last used ${formatDate(k.lastUsedAt)}` : " · never used"}
                </div>
              </div>
              {k.active ? (
                <form action={revokeApiKey}>
                  <input type="hidden" name="id" value={k.id} />
                  <button type="submit" className="text-red-600 hover:underline text-xs">
                    Revoke
                  </button>
                </form>
              ) : (
                <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-500">Revoked</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
