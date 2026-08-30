import { prisma } from "@/lib/prisma";

export type WalkthroughStep = { label: string; href: string; blurb: string };

/** Resolves the 12 walkthrough steps to real URLs in the current demo
 * company — the hero project, its structural steel bid package, and the
 * NorthPoint opportunity all have real (non-guessable) ids, so this looks
 * them up once rather than hardcoding routes the panel can't actually
 * reach. Returns null if this isn't the demo company or the hero data
 * isn't there (e.g. mid-reset) — the panel simply doesn't render then. */
export async function getWalkthroughSteps(companyId: string): Promise<WalkthroughStep[] | null> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { isDemo: true } });
  if (!company?.isDemo) return null;

  const job = await prisma.job.findFirst({
    where: { companyId, title: "Riverside Commerce Center" },
    include: { bidPackages: { where: { title: "Structural Steel Package" } } },
  });
  const opportunity = await prisma.opportunity.findFirst({
    where: { companyId, title: "NorthPoint Distribution Center" },
  });
  if (!job) return null;

  const bidPackage = job.bidPackages[0];

  return [
    { label: "Company Command", href: "/", blurb: "The executive opening screen — company-wide performance, exceptions, and cash in one view." },
    { label: "Project", href: `/jobs/${job.id}`, blurb: "Riverside Commerce Center's Command Center — the $1.8M hero project for this walkthrough." },
    { label: "Foreman Daily Report", href: `/jobs/${job.id}/daily-reports/new`, blurb: "Switch to Foreman, then submit today's report: Concrete slab on grade, 72 hours, 64 CY installed." },
    { label: "Labor Exception", href: `/jobs/${job.id}`, blurb: "Back on the Project page — the concrete line now shows real actual-vs-estimate variance from that one entry." },
    { label: "PM Daily Command", href: "/today", blurb: "Switch to Project Manager — the labor productivity exception surfaces here automatically, with why/impact/action/owner/due." },
    { label: "Job Cost", href: `/jobs/${job.id}#labor-productivity`, blurb: "The cost code detail behind the exception — estimated vs. actual hours and quantity, computed live." },
    { label: "Change Order", href: `/jobs/${job.id}/change-orders`, blurb: "Price and approve the footing change order already flagged from the field — watch the contract/SOV update." },
    ...(bidPackage
      ? [{ label: "SubBid", href: `/jobs/${job.id}/bid-packages/${bidPackage.id}`, blurb: "Select the structural steel winner — not just the lowest number, since one bid excludes real scope." }]
      : []),
    { label: "Billing", href: `/jobs/${job.id}/invoices`, blurb: "Switch to Accounting — schedule of values, pay applications, and billed-to-date for this project." },
    { label: "Cash", href: "/cash", blurb: "Company-wide AR/AP aging, retainage, and what needs action today." },
    { label: "Closeout", href: `/jobs/${job.id}/command-center/edit`, blurb: "Move a completed project to COMPLETE — its cost-code actuals become part of company history." },
    ...(opportunity
      ? [{ label: "Future Estimate", href: `/opportunities/${opportunity.id}`, blurb: "Switch to Estimator — add NorthPoint's concrete bid line and see that updated company history in the estimate." }]
      : []),
  ];
}
