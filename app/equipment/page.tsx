import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { updateEquipmentAssignment } from "@/lib/equipment-actions";
import { requireSession } from "@/lib/session";
import { canManageJobs } from "@/lib/auth";
import { formatMoney, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function toDateInputValue(date: Date | null): string {
  return date ? new Date(date).toISOString().slice(0, 10) : "";
}

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ conflict?: string }>;
}) {
  const session = await requireSession();
  const { conflict } = await searchParams;
  const equipment = await prisma.equipment.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: {
      assignments: {
        orderBy: { startDate: "desc" },
        include: { job: { select: { id: true, title: true } } },
      },
    },
  });

  const canEdit = canManageJobs(session.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Equipment</h1>
          <p className="text-slate-500 text-sm mt-1">Assignment, availability, and cost against budget for owned and rented equipment.</p>
        </div>
        {canEdit && (
          <div className="flex gap-3 text-sm">
            <Link href="/equipment/new" className="bg-white border text-sm px-4 py-2 rounded-md hover:bg-slate-50">
              + Add equipment
            </Link>
            <Link href="/equipment/assign" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
              + Assign to job
            </Link>
          </div>
        )}
      </div>

      {conflict && (
        <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-4 py-3">
          Scheduling conflict: this equipment already has an overlapping assignment on {decodeURIComponent(conflict)}.
          The new assignment was still saved — double-check before it goes out.
        </div>
      )}

      {equipment.length === 0 ? (
        <p className="text-slate-500 text-sm">No equipment yet.</p>
      ) : (
        <div className="space-y-4">
          {equipment.map((eq) => (
            <div key={eq.id} className="bg-white border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{eq.name}</div>
                  <div className="text-xs text-slate-500">
                    {eq.type ?? "—"} · {eq.ownership}
                    {eq.dailyRentalCost ? ` · ${formatMoney(eq.dailyRentalCost)}/day` : ""}
                  </div>
                </div>
              </div>

              {eq.assignments.length === 0 ? (
                <p className="text-xs text-slate-400">No assignments</p>
              ) : (
                <div className="divide-y border-t">
                  {eq.assignments.map((a) => (
                    <div key={a.id} className="py-2 flex items-center justify-between text-xs">
                      <div>
                        <Link href={`/jobs/${a.job.id}`} className="font-medium text-blue-600 hover:underline">
                          {a.job.title}
                        </Link>
                        <div className="text-slate-500">
                          Planned {formatDate(a.startDate)} – {formatDate(a.endDate)}
                          {a.actualPickupDate && ` · picked up ${formatDate(a.actualPickupDate)}`}
                          {a.actualReturnDate && ` · returned ${formatDate(a.actualReturnDate)}`}
                          {a.downtimeNotes && ` · ${a.downtimeNotes}`}
                        </div>
                      </div>
                      {canEdit && (
                        <form action={updateEquipmentAssignment} className="flex items-end gap-2">
                          <input type="hidden" name="id" value={a.id} />
                          <div>
                            <label className="block mb-1">Pickup</label>
                            <input name="actualPickupDate" type="date" defaultValue={toDateInputValue(a.actualPickupDate)} className="border rounded-md px-2 py-1" />
                          </div>
                          <div>
                            <label className="block mb-1">Return</label>
                            <input name="actualReturnDate" type="date" defaultValue={toDateInputValue(a.actualReturnDate)} className="border rounded-md px-2 py-1" />
                          </div>
                          <div>
                            <label className="block mb-1">Downtime</label>
                            <input name="downtimeNotes" defaultValue={a.downtimeNotes ?? ""} className="border rounded-md px-2 py-1 w-32" />
                          </div>
                          <button type="submit" className="bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-700">
                            Save
                          </button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
