import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { logout } from "@/lib/auth-actions";
import { canManageEstimates } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEMO_PERSONAS, switchDemoRole, resetDemo } from "@/lib/demo-actions";
import { ResetDemoButton } from "./reset-demo-button";
import "./globals.css";

export const metadata: Metadata = {
  title: "CrewSync — Company Operating System",
  description: "Award, schedule, run, cost, bill, and learn from every project — connected, not disconnected modules.",
};

// Grouped by who actually uses each link day to day, not alphabetically —
// Pipeline+Estimating (estimator's world) sit together right after Command,
// Financials+Cash (accounting's world) sit together below, rather than
// interleaved.
const PRIMARY_NAV = [
  { href: "/opportunities", label: "Pipeline" },
  { href: "/cost-codes", label: "Estimating" },
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
  const isDemo = session
    ? Boolean((await prisma.company.findUnique({ where: { id: session.companyId }, select: { isDemo: true } }))?.isDemo)
    : false;

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
                  <Link
                    href={session.role === "PM" ? "/?view=command" : "/"}
                    className="text-sm text-slate-600 hover:text-slate-900 font-medium"
                  >
                    Command
                  </Link>
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
                  {canManageEstimates(session.role) && (
                    <Link href="/cash" className="text-sm text-slate-600 hover:text-slate-900">
                      Cash
                    </Link>
                  )}
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
          {isDemo && session && (
            <div className="bg-slate-900 text-white">
              <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span className="font-semibold tracking-wide text-xs uppercase text-blue-300">Demo mode</span>
                <form action={switchDemoRole} className="flex flex-wrap items-center gap-1">
                  <span className="text-slate-400 mr-1">Switch Demo Role:</span>
                  {DEMO_PERSONAS.map((p) => {
                    const active = session.email === p.email;
                    return (
                      <button
                        key={p.key}
                        type="submit"
                        name="persona"
                        value={p.key}
                        disabled={active}
                        className={
                          active
                            ? "px-2 py-1 rounded-md bg-blue-600 text-white font-medium"
                            : "px-2 py-1 rounded-md text-slate-200 hover:bg-slate-800"
                        }
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </form>
                <div className="ml-auto">
                  <ResetDemoButton action={resetDemo} />
                </div>
              </div>
            </div>
          )}
          <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
