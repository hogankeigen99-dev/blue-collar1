import { prisma } from "@/lib/prisma";

export const BRIGHTSIDE_TITLE = "Brightside Automotive — Service Bay Slab & Footings";
export const NORTHPOINT_TITLE = "NorthPoint Distribution Center";

/**
 * Resolves which real records the Small Project Cockpit (app/demo/small-
 * project) is built on, without fetching everything the page needs — the
 * page does its own broader Promise.all once it knows these ids. Returns
 * null outside the demo company, or if the seeded Brightside opportunity is
 * missing (a Reset Demo hasn't been run since this feature shipped).
 */
export async function resolveCockpitIdentity(
  companyId: string
): Promise<{ opportunityId: string; jobId: string | null } | null> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { isDemo: true } });
  if (!company?.isDemo) return null;

  const opportunity = await prisma.opportunity.findFirst({ where: { companyId, title: BRIGHTSIDE_TITLE } });
  if (!opportunity) return null;

  return { opportunityId: opportunity.id, jobId: opportunity.wonJobId };
}
