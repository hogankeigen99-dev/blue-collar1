import Link from "next/link";
import { globalSearch, SEARCH_TYPE_LABEL } from "@/lib/search";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireSession();
  const { q } = await searchParams;
  const results = q ? await globalSearch(session.companyId, q) : [];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Search</h1>
        <form method="GET" className="mt-3 flex gap-2">
          <input
            name="q"
            defaultValue={q ?? ""}
            autoFocus
            placeholder="Projects, customers, workers, cost codes, change orders, materials, equipment, documents…"
            className="flex-1 border rounded-md px-3 py-2 text-sm"
          />
          <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
            Search
          </button>
        </form>
      </div>

      {q && q.trim().length < 2 && <p className="text-slate-500 text-sm">Keep typing — at least 2 characters.</p>}

      {q && q.trim().length >= 2 && (
        <div>
          {results.length === 0 ? (
            <p className="text-slate-500 text-sm">No matches for &quot;{q}&quot;.</p>
          ) : (
            <div className="bg-white border rounded-lg divide-y">
              {results.map((r) => (
                <Link key={`${r.type}-${r.id}`} href={r.href} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                  <div>
                    <div className="font-medium text-sm">{r.title}</div>
                    {r.subtitle && <div className="text-xs text-slate-500 mt-0.5">{r.subtitle}</div>}
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 whitespace-nowrap">
                    {SEARCH_TYPE_LABEL[r.type]}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
