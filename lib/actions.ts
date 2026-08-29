"use server";

import { scopedPrisma } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, requireSession } from "@/lib/session";
import { generateChecklistForStage } from "@/lib/checklist";
import { logAudit } from "@/lib/audit";

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function num(formData: FormData, key: string): number | undefined {
  const v = str(formData, key);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function createWorker(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const name = str(formData, "name");
  if (!name) throw new Error("Name is required");
  const divisionId = str(formData, "divisionId");
  if (divisionId) {
    // Division is a tenant model but the id is client-supplied — verify it
    // belongs to this company before assigning a worker to it.
    await prisma.division.findFirstOrThrow({ where: { id: divisionId } });
  }

  await prisma.worker.create({
    data: {
      companyId: session.companyId,
      name,
      role: str(formData, "role"),
      phone: str(formData, "phone"),
      email: str(formData, "email"),
      laborRate: num(formData, "laborRate"),
      divisionId,
    },
  });

  revalidatePath("/workers");
  redirect("/workers");
}

export async function createCustomer(formData: FormData) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const name = str(formData, "name");
  if (!name) throw new Error("Name is required");

  await prisma.customer.create({
    data: {
      companyId: session.companyId,
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
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const title = str(formData, "title");
  if (!title) throw new Error("Title is required");

  const scheduledAtRaw = str(formData, "scheduledAt");
  const workerIds = formData.getAll("workerIds").filter(
    (v): v is string => typeof v === "string" && v !== ""
  );

  const job = await prisma.job.create({
    data: {
      companyId: session.companyId,
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

  // Automation: a newly-created ("awarded") job starts in PRECON — generate its checklist.
  await generateChecklistForStage(prisma, job.id, "PRECON");

  revalidatePath("/jobs");
  revalidatePath("/");
  redirect(`/jobs/${job.id}`);
}

export async function updateJobStatus(jobId: string, status: string) {
  const session = await requireSession(); // any signed-in role, including foremen in the field
  const prisma = scopedPrisma(session.companyId);
  await prisma.job.update({
    where: { id: jobId },
    data: { status: status as never },
  });
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  revalidatePath("/");
}

export async function deleteJob(jobId: string) {
  const session = await requireRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const job = await prisma.job.delete({ where: { id: jobId } });
  await logAudit(session, { action: "job.deleted", entityType: "Job", entityId: jobId, detail: job.title });
  revalidatePath("/jobs");
  revalidatePath("/");
  redirect("/jobs");
}
