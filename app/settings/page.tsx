import Link from "next/link";
import { requirePageRole } from "@/lib/session";

export default async function SettingsPage() {
  await requirePageRole("ADMIN");

  const links = [
    { href: "/settings/divisions", title: "Divisions", desc: "Organizational segmentation for jobs and workers within your company." },
    { href: "/settings/checklist-templates", title: "Checklist templates", desc: "What the automation engine generates per project stage." },
    { href: "/settings/api-keys", title: "API keys", desc: "Server-to-server access to the read API." },
    { href: "/settings/webhooks", title: "Webhooks", desc: "Push job events to an external endpoint." },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="bg-white border rounded-lg divide-y">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="block px-4 py-3 hover:bg-slate-50">
            <div className="font-medium text-sm">{l.title}</div>
            <div className="text-slate-500 text-xs">{l.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
