import { NextResponse } from "next/server";
import { scopedPrisma } from "@/lib/tenant";
import { verifyApiKey } from "@/lib/api-key";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const key = await verifyApiKey(token);
  if (!key) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = scopedPrisma(key.companyId);
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      stage: true,
      contractValue: true,
      targetStartDate: true,
      targetEndDate: true,
      customer: { select: { name: true } },
    },
  });

  return NextResponse.json({ jobs });
}
