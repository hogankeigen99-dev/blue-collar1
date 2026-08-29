import { prisma } from "@/lib/prisma";
import { assignEquipment } from "@/lib/equipment-actions";
import { requirePageRole } from "@/lib/session";

export default async function AssignEquipmentPage() {
  await requirePageRole("ADMIN", "PM");
  const [equipment, jobs] = await Promise.all([
    prisma.equipment.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.job.findMany({ where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] } }, orderBy: { title: "asc" } }),
  ]);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Assign equipment to a job</h1>

      {equipment.length === 0 || jobs.length === 0 ? (
        <p className="text-sm text-slate-500">
          {equipment.length === 0 ? "No equipment yet." : "No scheduled or in-progress jobs yet."}
        </p>
      ) : (
        <form action={assignEquipment} className="space-y-4 bg-white border rounded-lg p-6">
          <div>
            <label className="block text-sm font-medium mb-1">Equipment *</label>
            <select name="equipmentId" required className="w-full border rounded-md px-3 py-2 text-sm">
              {equipment.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Job *</label>
            <select name="jobId" required className="w-full border rounded-md px-3 py-2 text-sm">
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start date *</label>
              <input name="startDate" type="date" required className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End date *</label>
              <input name="endDate" type="date" required className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
          </div>

          <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
            Assign
          </button>
        </form>
      )}
    </div>
  );
}
