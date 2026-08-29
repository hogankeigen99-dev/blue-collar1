import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  // Document isn't a tenant model — it's reached directly by id here, so the
  // job it belongs to (and that job's company) must be checked by hand.
  const doc = await prisma.document.findUnique({ where: { id }, include: { job: { select: { companyId: true } } } });
  if (!doc || doc.job.companyId !== session.companyId) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.contentType,
      "Content-Disposition": `inline; filename="${doc.title.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
