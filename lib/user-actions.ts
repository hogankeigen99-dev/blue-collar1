"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { randomBytes } from "crypto";

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

/**
 * Creates a login account (a User — distinct from Worker, which is a labor
 * resource with no login). ADMIN only. Two paths:
 *   - PASSWORD: an admin sets a temporary password the person changes later
 *     (there's no self-service password reset yet — out of scope for this
 *     phase, see the enterprise-security README notes).
 *   - SSO: no password is set. The account exists so the company's IdP
 *     login (lib/oidc.ts callback) has a real record to link by email on
 *     first sign-in — SSO is bring-your-identity-to-a-provisioned-account,
 *     not self-signup, so a stranger's IdP token can never mint themselves
 *     an ADMIN account here.
 */
export async function createUser(formData: FormData) {
  const session = await requireRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);
  const name = str(formData, "name");
  const email = str(formData, "email")?.toLowerCase();
  const role = str(formData, "role");
  const authProvider = str(formData, "authProvider") ?? "PASSWORD";
  const password = str(formData, "password");
  if (!name || !email || !role) throw new Error("Name, email, and role are required");
  if (authProvider === "PASSWORD" && !password) {
    throw new Error("A temporary password is required for password-auth accounts");
  }

  await prisma.user.create({
    data: {
      companyId: session.companyId,
      name,
      email,
      role: role as never,
      authProvider,
      passwordHash: authProvider === "PASSWORD" && password ? hashPassword(password) : null,
    },
  });

  revalidatePath("/settings/users");
  redirect("/settings/users");
}

export async function toggleUserActive(formData: FormData) {
  const session = await requireRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);
  const id = str(formData, "id");
  const active = formData.get("active") === "on";
  if (!id) throw new Error("User is required");
  if (id === session.userId && !active) {
    throw new Error("You can't deactivate your own account");
  }

  await prisma.user.update({ where: { id }, data: { active } });

  revalidatePath("/settings/users");
  redirect("/settings/users");
}

/** Issues a new temporary password for a PASSWORD-auth user (shown once, like an API key). */
export async function resetUserPassword(formData: FormData) {
  const session = await requireRole("ADMIN");
  const prisma = scopedPrisma(session.companyId);
  const id = str(formData, "id");
  if (!id) throw new Error("User is required");

  const tempPassword = randomBytes(9).toString("base64url");
  await prisma.user.update({ where: { id }, data: { passwordHash: hashPassword(tempPassword) } });

  revalidatePath("/settings/users");
  redirect(`/settings/users?tempPassword=${encodeURIComponent(tempPassword)}`);
}
