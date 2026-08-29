import { prisma } from "@/lib/prisma";
import { createChecklistTemplateItem, deleteChecklistTemplateItem } from "@/lib/checklist-actions";
import { requirePageRole } from "@/lib/session";
import { PROJECT_STAGE_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

const STAGES = ["PRECON", "MOBILIZATION", "ACTIVE", "PUNCH_LIST", "CLOSEOUT", "COMPLETE"] as const;

export default async function ChecklistTemplatesPage() {
  await requirePageRole("ADMIN");

  const items = await prisma.checklistTemplateItem.findMany({ orderBy: [{ stage: "asc" }, { sortOrder: "asc" }] });
  const byStage = Object.fromEntries(STAGES.map((s) => [s, items.filter((i) => i.stage === s)]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Checklist templates</h1>
        <p className="text-slate-500 text-sm mt-1">
          The automation engine — the moment a job is created or moves into a stage, these
          items are generated on that job&apos;s checklist automatically.
        </p>
      </div>

      {STAGES.map((stage) => (
        <div key={stage} className="space-y-3">
          <h2 className="text-lg font-medium">{PROJECT_STAGE_LABEL[stage]}</h2>
          {byStage[stage].length === 0 ? (
            <p className="text-slate-500 text-sm">No template items for this stage.</p>
          ) : (
            <div className="bg-white border rounded-lg divide-y">
              {byStage[stage].map((item) => (
                <div key={item.id} className="px-4 py-2 flex items-center justify-between text-sm">
                  <span>{item.title}</span>
                  <form action={deleteChecklistTemplateItem}>
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" className="text-red-600 hover:underline text-xs">
                      Remove
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
          <form action={createChecklistTemplateItem} className="flex items-end gap-2">
            <input type="hidden" name="stage" value={stage} />
            <div className="flex-1">
              <input name="title" placeholder="New template item" required className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
            <button type="submit" className="bg-slate-900 text-white text-sm px-3 py-2 rounded-md hover:bg-slate-700">
              Add
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}
