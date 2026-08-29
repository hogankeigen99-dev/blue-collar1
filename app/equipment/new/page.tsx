import { createEquipment } from "@/lib/equipment-actions";
import { requirePageRole } from "@/lib/session";

export default async function NewEquipmentPage() {
  await requirePageRole("ADMIN", "PM");

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Add equipment</h1>
      <form action={createEquipment} className="space-y-4 bg-white border rounded-lg p-6">
        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input name="name" required placeholder="e.g. Skid steer #2" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Type</label>
          <input name="type" placeholder="e.g. Skid steer" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Ownership *</label>
          <select name="ownership" required className="w-full border rounded-md px-3 py-2 text-sm">
            <option value="OWNED">Owned</option>
            <option value="RENTED">Rented</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Daily rental cost</label>
          <input name="dailyRentalCost" type="number" step="any" min="0" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
          Add equipment
        </button>
      </form>
    </div>
  );
}
