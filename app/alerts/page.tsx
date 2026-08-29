import { redirect } from "next/navigation";

// Folded into the Company Action Center (/today) — same underlying
// getAlerts() scan, but with why/impact/action/owner/due added and no
// separate page duplicating a subset of the same data. Route kept alive
// (redirecting, not removed) so any existing link/bookmark still lands
// somewhere useful.
export default function AlertsRedirect() {
  redirect("/today");
}
