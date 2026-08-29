"use server";

import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, signSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = email
    ? await prisma.user.findUnique({ where: { email } })
    : null;

  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    redirect("/login?error=1");
  }

  const token = await signSession({
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
  redirect("/");
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
