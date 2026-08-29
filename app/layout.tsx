import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { logout } from "@/lib/auth-actions";
import { canManageEstimates } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "CrewSync — Crew, Job & Labor Productivity Manager",
  description: "Manage jobs, crews, scheduling, and self-perform labor productivity.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="border-b bg-white">
            <nav className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link href="/" className="font-semibold text-lg">
                CrewSync
              </Link>
              {session && (
                <>
                  <Link href="/today" className="text-sm text-slate-600 hover:text-slate-900 font-medium">
                    Today
                  </Link>
                  <Link href="/jobs" className="text-sm text-slate-600 hover:text-slate-900">
                    Jobs
                  </Link>
                  <Link href="/alerts" className="text-sm text-slate-600 hover:text-slate-900">
                    Alerts
                  </Link>
                  <Link href="/schedule" className="text-sm text-slate-600 hover:text-slate-900">
                    Schedule
                  </Link>
                  <Link href="/equipment" className="text-sm text-slate-600 hover:text-slate-900">
                    Equipment
                  </Link>
                  <Link href="/workers" className="text-sm text-slate-600 hover:text-slate-900">
                    Workers
                  </Link>
                  <Link href="/customers" className="text-sm text-slate-600 hover:text-slate-900">
                    Customers
                  </Link>
                  <Link href="/cost-codes" className="text-sm text-slate-600 hover:text-slate-900">
                    Cost Codes
                  </Link>
                  {canManageEstimates(session.role) && (
                    <Link href="/accounting" className="text-sm text-slate-600 hover:text-slate-900">
                      Accounting
                    </Link>
                  )}
                  {session.role === "ADMIN" && (
                    <Link href="/settings" className="text-sm text-slate-600 hover:text-slate-900">
                      Settings
                    </Link>
                  )}
                  <div className="ml-auto flex items-center gap-3">
                    <span className="text-sm text-slate-500">
                      {session.name} <span className="text-slate-400">({session.role})</span>
                    </span>
                    <form action={logout}>
                      <button type="submit" className="text-sm text-slate-600 hover:text-slate-900">
                        Sign out
                      </button>
                    </form>
                  </div>
                </>
              )}
            </nav>
          </header>
          <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
