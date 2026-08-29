import { createCostCode } from "@/lib/productivity-actions";

const UNITS = ["CY", "SF", "LF", "SQ", "TON", "EA", "HR", "LS"] as const;

export default function NewCostCodePage() {
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">New cost code</h1>
      <form action={createCostCode} className="space-y-4 bg-white border rounded-lg p-6">
        <div>
          <label className="block text-sm font-medium mb-1">Code *</label>
          <input
            name="code"
            required
            placeholder="e.g. 03 30 00"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description *</label>
          <input
            name="description"
            required
            placeholder="e.g. Concrete slab on grade"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Unit of measure *</label>
          <select name="unit" required className="w-full border rounded-md px-3 py-2 text-sm">
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
        >
          Create cost code
        </button>
      </form>
    </div>
  );
}
