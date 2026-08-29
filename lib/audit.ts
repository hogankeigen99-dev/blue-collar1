import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth";

export async function logAudit(
  session: SessionPayload,
  entry: { action: string; entityType: string; entityId?: string; jobId?: string; detail?: string }
) {
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      userName: session.name,
      userRole: session.role,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      jobId: entry.jobId,
      detail: entry.detail,
    },
  });
}
