"use server";

import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, signSession } from "@/lib/auth";
import { requireSession } from "@/lib/session";
import { seedDemoCompany } from "@/lib/demo-seed";
import { DEMO_PERSONAS } from "@/lib/demo-personas";

/** True only for the seeded demo company — every demo-only control (persona
 * switcher, walkthrough, reset) gates on this, server-side, not just by
 * hiding a button. */
export async function isDemoCompany(companyId: string): Promise<boolean> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { isDemo: true } });
  return company?.isDemo ?? false;
}

/** Swaps the current session for one of the 5 fixed demo personas — a real
 * login swap (new signed session, real user, real role/permissions), not a
 * client-side view toggle. Refuses to run outside the demo company, and the
 * target account is always looked up within the caller's own companyId, so
 * this can never cross a tenant boundary. */
export async function switchDemoRole(formData: FormData) {
  const session = await requireSession();
  if (!(await isDemoCompany(session.companyId))) {
    throw new Error("Switch Demo Role is only available in the demo company.");
  }

  const key = String(formData.get("persona") ?? "");
  const persona = DEMO_PERSONAS.find((p) => p.key === key);
  if (!persona) {
    throw new Error(`Unknown demo persona: ${key}`);
  }

  const user = await prisma.user.findFirst({
    where: { companyId: session.companyId, email: persona.email },
  });
  if (!user) {
    throw new Error(`Demo persona account not found: ${persona.email}`);
  }

  const token = await signSession({
    userId: user.id,
    companyId: user.companyId,
    name: user.name,
    email: user.email,
    role: user.role,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
  redirect(persona.landing);
}

/** Wipes and re-seeds ONLY the demo company — never touches any other
 * tenant. Deleting the Company row cascades to every tenant-scoped model
 * (all FKs to Company are onDelete: Cascade, same guarantee tenant
 * isolation already relies on), so this can't leave orphaned rows behind. */
export async function resetDemo() {
  const session = await requireSession();
  const company = await prisma.company.findUnique({ where: { id: session.companyId } });
  if (!company?.isDemo) {
    throw new Error("Reset Demo is only available in the demo company.");
  }

  await prisma.company.delete({ where: { id: company.id } });
  await seedDemoCompany();

  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login?reset=1");
}
