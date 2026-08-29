import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  // DailyReportPhoto isn't a tenant model — it's reached directly by id
  // here, so the job (via its daily report) it belongs to must be checked by hand.
  const photo = await prisma.dailyReportPhoto.findUnique({
    where: { id },
    include: { dailyReport: { select: { job: { select: { companyId: true } } } } },
  });
  if (!photo || photo.dailyReport.job.companyId !== session.companyId) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
