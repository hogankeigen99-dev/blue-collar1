import { prisma } from "@/lib/prisma";

export type SmallProjectStep = {
  day: string;
  label: string;
  href: string;
  blurb: string;
  /** "propagation" renders the Daily Report -> ... -> Company Command
   * chain; "summary" renders the without/with CrewSync close. Both are
   * demo-only annotation over the real page the step already links to —
   * not a substitute for it. */
  kind?: "propagation" | "summary";
};

const OPPORTUNITY_TITLE = "Brightside Automotive — Service Bay Slab & Footings";
const NEXT_ESTIMATE_TITLE = "NorthPoint Distribution Center";

/**
 * The Small Project Live Flow — Award through Closeout for one 5-10 day,
 * 1-2 crew, ~$195K self-perform job (Brightside Automotive), told strictly
 * day by day. Distinct from the general Walkthrough (lib/walkthrough.ts):
 * that one tours the whole app's modules; this one tells CrewSync's actual
 * pitch as a single story. The job doesn't exist until the live Day 0
 * Award step creates it, so every job-dependent href falls back to the
 * opportunity page until then — always a real, resolvable page, never a
 * dead link while the presenter is mid-story.
 */
export async function getSmallProjectFlowSteps(companyId: string): Promise<SmallProjectStep[] | null> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { isDemo: true } });
  if (!company?.isDemo) return null;

  const opportunity = await prisma.opportunity.findFirst({ where: { companyId, title: OPPORTUNITY_TITLE } });
  if (!opportunity) return null;
  const opportunityHref = `/opportunities/${opportunity.id}`;

  const job = opportunity.wonJobId ? await prisma.job.findFirst({ where: { id: opportunity.wonJobId } }) : null;
  const jobHref = job ? `/jobs/${job.id}` : opportunityHref;

  const nextEstimate = await prisma.opportunity.findFirst({ where: { companyId, title: NEXT_ESTIMATE_TITLE } });
  const nextEstimateHref = nextEstimate ? `/opportunities/${nextEstimate.id}` : "/opportunities";

  return [
    {
      day: "Day 0",
      label: "Award",
      href: opportunityHref,
      blurb:
        'A real, undecided bid — mark it WON. Customer, scope, estimate, cost codes, and contract value all carry forward into the Award form automatically. The PM never retypes any of it.',
    },
    {
      day: "Day 0",
      label: "What's Missing",
      href: jobHref,
      blurb:
        "The project the moment it's created — PRECON checklist unchecked, no crew staffed yet. CrewSync tells the PM exactly what has to happen before mobilization, instead of a blank page.",
    },
    {
      day: "Day 1",
      label: "Assign Crew",
      href: `${jobHref}#crew`,
      blurb: "Staff 1-2 workers for the week right on the project page — no separate scheduling trip, no re-entry.",
    },
    {
      day: "Day 1",
      label: "Foreman's Workspace",
      href: "/field",
      blurb:
        "Switch to Foreman — the project is already there: today's work, crew, cost codes, estimated labor and quantity, equipment, materials, and any open blockers.",
    },
    {
      day: "Day 2",
      label: "Field Execution",
      href: job ? `${jobHref}/daily-reports/new` : opportunityHref,
      blurb:
        "One Daily Report: 72 hours / 64 CY on the concrete line, plus an equipment issue, a material need, and the changed footing condition. ONE SUBMISSION.",
    },
    {
      day: "Day 2",
      label: "Enter Once",
      href: `${jobHref}#labor-productivity`,
      kind: "propagation",
      blurb: "That one submission is already live everywhere below — nothing else to fill out.",
    },
    {
      day: "Day 3",
      label: "PM Daily Command",
      href: "/today",
      blurb:
        "Switch to Project Manager — LABOR PRODUCTIVITY RISK is already waiting: estimate 0.85 hrs/CY, actual 1.13 hrs/CY, +33% variance, with why/impact/action/owner/due. Plus the equipment issue and material need from yesterday's report.",
    },
    {
      day: "Day 4",
      label: "Change Management",
      href: job ? `${jobHref}/change-orders` : opportunityHref,
      blurb:
        "The changed footing condition, already a real pending change order from Day 2 — price it (~$28,500 revenue / $21,000 cost) and approve. Contract, SOV, and billing eligibility update automatically.",
    },
    {
      day: "Day 5",
      label: "Accounting Handoff",
      href: job ? `${jobHref}/contract` : opportunityHref,
      blurb:
        "Switch to Accounting — the updated contract value, the approved CO, and billing readiness are already here. Accounting never has to call the PM to ask if the job is ready to bill.",
    },
    {
      day: "Day 6-7",
      label: "Closeout",
      href: job ? `${jobHref}/command-center/edit` : opportunityHref,
      blurb:
        "Move the project to COMPLETE. Final labor hours, final quantity, final hrs/unit, margin, and outstanding retainage are all already computed — closing it is the only action left.",
    },
    {
      day: "Next Estimate",
      label: "Closed Loop",
      href: nextEstimateHref,
      blurb:
        "Switch to Estimator — open a similar future bid. Its own estimate (0.85 hrs/CY) now shows against real company history (~1.04) and recent jobs (~1.08), including the project you just closed.",
    },
    {
      day: "Summary",
      label: "Without vs. With CrewSync",
      href: "/",
      kind: "summary",
      blurb: "The closed loop this whole flow just proved, end to end.",
    },
  ];
}
