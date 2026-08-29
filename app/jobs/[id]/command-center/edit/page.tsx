import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
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
  await requirePageRole("ADMIN", "PM");
  const { id } = await params;

  const [job, pmUsers, foremen] = await Promise.all([
    prisma.job.findUnique({ where: { id } }),
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "PM"] }, active: true }, orderBy: { name: "asc" } }),
    prisma.worker.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
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
