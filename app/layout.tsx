import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { logout } from "@/lib/auth-actions";
import { canManageEstimates } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "CrewSync — Company Operating System",
  description: "Award, schedule, run, cost, bill, and learn from every project — connected, not disconnected modules.",
};

const PRIMARY_NAV = [
  { href: "/", label: "Command" },
  { href: "/opportunities", label: "Pipeline" },
  { href: "/today", label: "Action Center" },
  { href: "/projects", label: "Projects" },
  { href: "/field", label: "Field" },
  { href: "/schedule", label: "Schedule" },
] as const;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const isForeman = session?.role === "FOREMAN";

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="border-b bg-white">
            <nav className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link href="/" className="font-semibold text-lg">
                CrewSync
              </Link>

              {session && isForeman && (
                <>
                  <Link href="/field" className="text-sm text-slate-600 hover:text-slate-900 font-medium">
                    Today
                  </Link>
                  <Link href="/schedule" className="text-sm text-slate-600 hover:text-slate-900">
                    Schedule
                  </Link>
                </>
              )}

              {session && !isForeman && (
                <>
                  {PRIMARY_NAV.map((item) => (
                    <Link key={item.href} href={item.href} className="text-sm text-slate-600 hover:text-slate-900 font-medium">
                      {item.label}
                    </Link>
                  ))}
                  {canManageEstimates(session.role) && (
                    <Link href="/financials" className="text-sm text-slate-600 hover:text-slate-900">
                      Financials
                    </Link>
                  )}
                  <Link href="/cost-codes" className="text-sm text-slate-600 hover:text-slate-900">
                    Estimating
                  </Link>
                  <Link href="/company" className="text-sm text-slate-600 hover:text-slate-900">
                    Company
                  </Link>
                  {session.role === "ADMIN" && (
                    <Link href="/settings" className="text-sm text-slate-600 hover:text-slate-900">
                      Settings
                    </Link>
                  )}
                </>
              )}

              {session && (
                <div className="ml-auto flex items-center gap-3">
                  {!isForeman && (
                    <form action="/search" method="GET" className="hidden md:block">
                      <input
                        name="q"
                        placeholder="Search…"
                        className="text-sm border rounded-md px-2 py-1 w-40 focus:w-56 transition-all"
                      />
                    </form>
                  )}
                  <span className="text-sm text-slate-500 whitespace-nowrap">
                    {session.name} <span className="text-slate-400">({session.role})</span>
                  </span>
                  <form action={logout}>
                    <button type="submit" className="text-sm text-slate-600 hover:text-slate-900">
                      Sign out
                    </button>
                  </form>
                </div>
              )}
            </nav>
          </header>
          <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
