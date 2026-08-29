import Link from "next/link";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const LINKS = [
  { href: "/company/resources", title: "Resource command", desc: "Crews today, availability, upcoming starts, equipment location" },
  { href: "/workers", title: "Workers", desc: "Crew roster, roles, labor rates, availability" },
  { href: "/customers", title: "Customers", desc: "Customer records and contact info" },
  { href: "/vendors", title: "Vendors", desc: "Vendor/subcontractor directory, committed spend, and COI compliance" },
  { href: "/equipment", title: "Equipment", desc: "Owned/rented equipment and assignment history" },
  { href: "/settings/divisions", title: "Divisions", desc: "Organizational/business-line grouping" },
];

export default async function CompanyHubPage() {
  await requireSession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Company</h1>
        <p className="text-slate-500 text-sm mt-1">The people, equipment, and organizational records the rest of CrewSync runs on.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="bg-white border rounded-lg p-4 hover:border-slate-400 transition-colors">
            <div className="font-medium">{l.title}</div>
            <div className="text-sm text-slate-500 mt-1">{l.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
