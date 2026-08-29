import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canManageEstimates } from "@/lib/auth";
import { buildAccountingExportData, getAccountingConnector } from "@/lib/accounting";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canManageEstimates(session.role)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const data = await buildAccountingExportData(session.companyId, id);
  if (!data) return new NextResponse("Not found", { status: 404 });

  const connector = getAccountingConnector();
  const result = await connector.export(data);

  return new NextResponse(result.body, {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
    },
  });
}
