import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canManageEstimates } from "@/lib/auth";
import { buildAccountingExportData } from "@/lib/accounting";
import { CsvAccountingConnector } from "@/lib/accounting/csv-connector";

// CSV download only — a GET route must stay safe/idempotent, so pushing to
// a connected external system (Sage) is a separate POST action instead
// (lib/accounting/sage-export-actions.ts) rather than another branch here.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canManageEstimates(session.role)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const data = await buildAccountingExportData(session.companyId, id);
  if (!data) return new NextResponse("Not found", { status: 404 });

  const connector = new CsvAccountingConnector();
  const result = await connector.export(data);

  return new NextResponse(result.body, {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
    },
  });
}
