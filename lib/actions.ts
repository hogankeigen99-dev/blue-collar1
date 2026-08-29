"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, requireSession } from "@/lib/session";

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export async function createWorker(formData: FormData) {
  await requireRole("ADMIN", "PM");
  const name = str(formData, "name");
  if (!name) throw new Error("Name is required");

  await prisma.worker.create({
    data: {
      name,
      role: str(formData, "role"),
      phone: str(formData, "phone"),
      email: str(formData, "email"),
    },
  });

  revalidatePath("/workers");
  redirect("/workers");
}

export async function createCustomer(formData: FormData) {
  await requireRole("ADMIN", "PM");
  const name = str(formData, "name");
  if (!name) throw new Error("Name is required");

  await prisma.customer.create({
    data: {
      name,
      phone: str(formData, "phone"),
      email: str(formData, "email"),
      address: str(formData, "address"),
      notes: str(formData, "notes"),
    },
  });

  revalidatePath("/customers");
  redirect("/customers");
}

export async function createJob(formData: FormData) {
  await requireRole("ADMIN", "PM");
  const title = str(formData, "title");
  if (!title) throw new Error("Title is required");

  const scheduledAtRaw = str(formData, "scheduledAt");
  const workerIds = formData.getAll("workerIds").filter(
    (v): v is string => typeof v === "string" && v !== ""
  );

  const job = await prisma.job.create({
    data: {
      title,
      description: str(formData, "description"),
      address: str(formData, "address"),
      customerId: str(formData, "customerId"),
      scheduledAt: scheduledAtRaw ? new Date(scheduledAtRaw) : undefined,
      assignments: {
        create: workerIds.map((workerId) => ({ workerId })),
      },
    },
  });

  revalidatePath("/jobs");
  revalidatePath("/");
  redirect(`/jobs/${job.id}`);
}

export async function updateJobStatus(jobId: string, status: string) {
  await requireSession(); // any signed-in role, including foremen in the field
  await prisma.job.update({
    where: { id: jobId },
    data: { status: status as never },
  });
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  revalidatePath("/");
}

export async function deleteJob(jobId: string) {
  await requireRole("ADMIN", "PM");
  await prisma.job.delete({ where: { id: jobId } });
  revalidatePath("/jobs");
  revalidatePath("/");
  redirect("/jobs");
}
