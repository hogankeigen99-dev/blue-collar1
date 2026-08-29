import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { importJobCostCodesCsv } from "@/lib/materials-actions";
import { requirePageRole } from "@/lib/session";

export default async function ImportJobCostCodesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePageRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;
  const job = await prisma.job.findFirst({ where: { id } });
  if (!job) notFound();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href={`/jobs/${job.id}`} className="text-sm text-blue-600 hover:underline">
          &larr; {job.title}
        </Link>
        <h1 className="text-2xl font-semibold mt-1">Import budget lines from CSV</h1>
        <p className="text-slate-500 text-sm mt-1">
          Bulk-load this job&apos;s estimate instead of adding cost codes one at a time.
          Each <code className="bg-slate-100 px-1 rounded">code</code> must already exist
          in the{" "}
          <Link href="/cost-codes" className="text-blue-600 hover:underline">
            cost code library
          </Link>
          — unmatched codes are skipped and listed after import.
        </p>
      </div>

      <div className="bg-slate-100 border rounded-lg p-4 text-xs font-mono whitespace-pre">
{`code,estimatedQty,estimatedHours
03 30 00,400,340
31 23 00,300,90`}
      </div>

      <form
        action={importJobCostCodesCsv}
        encType="multipart/form-data"
        className="space-y-4 bg-white border rounded-lg p-6"
      >
        <input type="hidden" name="jobId" value={job.id} />

        <div>
          <label className="block text-sm font-medium mb-1">CSV file</label>
          <input
            name="csvFile"
            type="file"
            accept=".csv,text/csv"
            className="w-full border rounded-md px-3 py-2 text-sm bg-white"
          />
        </div>

        <div className="text-center text-xs text-slate-400">— or paste CSV text —</div>

        <div>
          <label className="block text-sm font-medium mb-1">Paste CSV</label>
          <textarea
            name="csvText"
            rows={6}
            placeholder={"code,estimatedQty,estimatedHours\n03 30 00,400,340"}
            className="w-full border rounded-md px-3 py-2 text-sm font-mono"
          />
        </div>

        <button
          type="submit"
          className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
        >
          Import
        </button>
      </form>
    </div>
  );
}
