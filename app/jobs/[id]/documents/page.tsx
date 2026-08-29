import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { uploadDocument, deleteDocument } from "@/lib/document-actions";
import { requireSession } from "@/lib/session";
import { canManageJobs } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const CATEGORIES = ["DRAWING", "CONTRACT", "RFI", "SUBMITTAL", "PHOTO", "SAFETY", "CLOSEOUT", "WARRANTY", "OTHER"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  DRAWING: "Drawings",
  CONTRACT: "Contracts",
  RFI: "RFIs",
  SUBMITTAL: "Submittals",
  PHOTO: "Photos",
  SAFETY: "Safety",
  CLOSEOUT: "Closeout",
  WARRANTY: "Warranties",
  OTHER: "Other",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const [job, documents, workers] = await Promise.all([
    prisma.job.findUnique({ where: { id } }),
    prisma.document.findMany({ where: { jobId: id }, orderBy: { createdAt: "desc" }, include: { uploadedBy: true } }),
    prisma.worker.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!job) notFound();

  const canDelete = canManageJobs(session.role);
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, documents.filter((d) => d.category === c)]));

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/jobs/${job.id}`} className="text-sm text-blue-600 hover:underline">
          &larr; {job.title}
        </Link>
        <h1 className="text-2xl font-semibold mt-1">Documents</h1>
        <p className="text-slate-500 text-sm mt-1">
          Drawings, contracts, RFIs, submittals, field photos, safety docs, closeout files,
          and warranties, all living against this job.
        </p>
      </div>

      <form action={uploadDocument} encType="multipart/form-data" className="space-y-4 bg-white border rounded-lg p-6">
        <input type="hidden" name="jobId" value={job.id} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Category *</label>
            <select name="category" required className="w-full border rounded-md px-3 py-2 text-sm">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input name="title" placeholder="Defaults to file name" className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">File * (10MB max)</label>
          <input name="file" type="file" required className="w-full border rounded-md px-3 py-2 text-sm bg-white" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Uploaded by</label>
          <select name="uploadedById" className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="">— None —</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
          Upload
        </button>
      </form>

      {documents.length === 0 ? (
        <p className="text-slate-500 text-sm">No documents yet.</p>
      ) : (
        CATEGORIES.filter((c) => byCategory[c].length > 0).map((c) => (
          <div key={c} className="space-y-3">
            <h2 className="text-lg font-medium">{CATEGORY_LABEL[c]}</h2>
            <div className="bg-white border rounded-lg divide-y">
              {byCategory[c].map((doc) => (
                <div key={doc.id} className="px-4 py-3 flex items-center justify-between text-sm">
                  <a href={`/api/documents/${doc.id}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {doc.title}
                  </a>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>
                      {formatBytes(doc.fileSize)} · {formatDate(doc.createdAt)}
                      {doc.uploadedBy ? ` · ${doc.uploadedBy.name}` : ""}
                    </span>
                    {canDelete && (
                      <form action={deleteDocument}>
                        <input type="hidden" name="id" value={doc.id} />
                        <input type="hidden" name="jobId" value={job.id} />
                        <button type="submit" className="text-red-600 hover:underline">
                          Delete
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
