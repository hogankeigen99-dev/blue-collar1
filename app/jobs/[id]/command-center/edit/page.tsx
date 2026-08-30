import Link from "next/link";
import { notFound } from "next/navigation";
import { scopedPrisma } from "@/lib/tenant";
import { updateJobCommandCenter } from "@/lib/command-center-actions";
import { requirePageRole } from "@/lib/session";
import { PROJECT_STAGE_LABEL } from "@/lib/format";

const STAGES = ["PRECON", "MOBILIZATION", "ACTIVE", "PUNCH_LIST", "CLOSEOUT", "COMPLETE"] as const;

function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function EditCommandCenterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePageRole("ADMIN", "PM");
  const prisma = scopedPrisma(session.companyId);
  const { id } = await params;

  const [job, pmUsers, foremen, divisions] = await Promise.all([
    prisma.job.findFirst({ where: { id } }),
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "PM"] }, active: true }, orderBy: { name: "asc" } }),
    prisma.worker.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.division.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!job) notFound();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href={`/jobs/${job.id}`} className="text-sm text-blue-600 hover:underline">
          &larr; {job.title}
        </Link>
        <h1 className="text-2xl font-semibold mt-1">Edit command center</h1>
      </div>

      <form action={updateJobCommandCenter} className="space-y-4 bg-white border rounded-lg p-6">
        <input type="hidden" name="jobId" value={job.id} />

        <div>
          <label className="block text-sm font-medium mb-1">Contract value</label>
          <input
            name="contractValue"
            type="number"
            step="any"
            min="0"
            defaultValue={job.contractValue ?? ""}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Project manager</label>
          <select name="pmUserId" defaultValue={job.pmUserId ?? ""} className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="">— None —</option>
            {pmUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Project type</label>
          <input
            name="projectType"
            defaultValue={job.projectType ?? ""}
            placeholder="e.g. Residential slab, Commercial TI, Site work"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500 mt-1">
            Used to filter this job&apos;s cost codes into the right{" "}
            <Link href="/cost-codes" className="text-blue-600 hover:underline">
              historical productivity
            </Link>{" "}
            comparison once it&apos;s complete.
          </p>
        </div>

        {divisions.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-1">Division</label>
            <select name="divisionId" defaultValue={job.divisionId ?? ""} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">— None —</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Foreman</label>
          <select name="foremanWorkerId" defaultValue={job.foremanWorkerId ?? ""} className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="">— None —</option>
            {foremen.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} {w.role && `(${w.role})`}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Target start</label>
            <input
              name="targetStartDate"
              type="date"
              defaultValue={toDateInputValue(job.targetStartDate)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Target finish</label>
            <input
              name="targetEndDate"
              type="date"
              defaultValue={toDateInputValue(job.targetEndDate)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Project stage</label>
          <select name="stage" defaultValue={job.stage} className="w-full border rounded-md px-3 py-2 text-sm">
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="border-t pt-4 space-y-3">
          <label className="block text-sm font-medium">Permit</label>
          <input
            name="permitNumber"
            defaultValue={job.permitNumber ?? ""}
            placeholder="Permit number"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Issued</label>
              <input
                name="permitIssuedDate"
                type="date"
                defaultValue={toDateInputValue(job.permitIssuedDate)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Expires</label>
              <input
                name="permitExpirationDate"
                type="date"
                defaultValue={toDateInputValue(job.permitExpirationDate)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Billed to date is no longer set here — it&apos;s computed from this job&apos;s{" "}
          <Link href={`/jobs/${job.id}/invoices`} className="text-blue-600 hover:underline">
            invoices
          </Link>
          .
        </p>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="punchListComplete" defaultChecked={job.punchListComplete} />
            Punch list complete
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requiredDocsComplete" defaultChecked={job.requiredDocsComplete} />
            Required documents complete
          </label>
        </div>

        <button
          type="submit"
          className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
        >
          Save
        </button>
      </form>
    </div>
  );
}
