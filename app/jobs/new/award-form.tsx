"use client";

import { useState } from "react";

type CostCodeOption = { id: string; code: string; description: string; unit: string };
type EquipmentOption = { id: string; name: string; type: string | null };

function newId() {
  return Math.random().toString(36).slice(2);
}

/** The four repeatable-row sections of the award form (cost codes, initial
 * materials, initial equipment, initial subcontractors). Each section is its
 * own small add/remove-row list; rows post as same-named, position-zipped
 * fields (see lib/award-actions.ts's zipRows) so no indexed field names are
 * needed. */
export default function AwardRepeatableSections({
  costCodes,
  equipmentList,
}: {
  costCodes: CostCodeOption[];
  equipmentList: EquipmentOption[];
}) {
  const [costCodeRows, setCostCodeRows] = useState<string[]>([newId()]);
  const [materialRows, setMaterialRows] = useState<string[]>([]);
  const [equipmentRows, setEquipmentRows] = useState<string[]>([]);
  const [subRows, setSubRows] = useState<string[]>([]);

  return (
    <div className="space-y-6">
      {/* Cost codes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Cost codes &amp; labor budget</h3>
          <button
            type="button"
            onClick={() => setCostCodeRows((r) => [...r, newId()])}
            className="text-xs text-blue-600 hover:underline"
          >
            + Add cost code
          </button>
        </div>
        <div className="space-y-2">
          {costCodeRows.length === 0 && <p className="text-xs text-slate-500">No cost codes added.</p>}
          {costCodeRows.map((id) => (
            <div key={id} className="flex gap-2 items-center">
              <select name="costCodeId" className="flex-1 border rounded-md px-2 py-1.5 text-sm">
                <option value="">— Cost code —</option>
                {costCodes.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.code} — {cc.description} ({cc.unit})
                  </option>
                ))}
              </select>
              <input
                name="costCodeQty"
                type="number"
                step="any"
                placeholder="Est. qty"
                className="w-24 border rounded-md px-2 py-1.5 text-sm"
              />
              <input
                name="costCodeHours"
                type="number"
                step="any"
                placeholder="Est. hrs"
                className="w-24 border rounded-md px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => setCostCodeRows((r) => r.filter((x) => x !== id))}
                className="text-slate-400 hover:text-red-600 text-xs px-1"
                aria-label="Remove row"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Materials */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Materials (optional, initial requests)</h3>
          <button
            type="button"
            onClick={() => setMaterialRows((r) => [...r, newId()])}
            className="text-xs text-blue-600 hover:underline"
          >
            + Add material
          </button>
        </div>
        <div className="space-y-2">
          {materialRows.map((id) => (
            <div key={id} className="flex gap-2 items-center flex-wrap">
              <input
                name="materialDescription"
                placeholder="Description"
                className="flex-1 min-w-[10rem] border rounded-md px-2 py-1.5 text-sm"
              />
              <input name="materialQty" type="number" step="any" placeholder="Qty" className="w-20 border rounded-md px-2 py-1.5 text-sm" />
              <input name="materialUnit" placeholder="Unit" className="w-20 border rounded-md px-2 py-1.5 text-sm" />
              <input name="materialVendor" placeholder="Vendor" className="w-32 border rounded-md px-2 py-1.5 text-sm" />
              <input name="materialExpected" type="date" className="border rounded-md px-2 py-1.5 text-sm" />
              <button
                type="button"
                onClick={() => setMaterialRows((r) => r.filter((x) => x !== id))}
                className="text-slate-400 hover:text-red-600 text-xs px-1"
                aria-label="Remove row"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Equipment */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Equipment (optional, initial assignments)</h3>
          <button
            type="button"
            onClick={() => setEquipmentRows((r) => [...r, newId()])}
            className="text-xs text-blue-600 hover:underline"
          >
            + Add equipment
          </button>
        </div>
        <div className="space-y-2">
          {equipmentRows.map((id) => (
            <div key={id} className="flex gap-2 items-center flex-wrap">
              <select name="equipmentId" className="flex-1 min-w-[10rem] border rounded-md px-2 py-1.5 text-sm">
                <option value="">— Equipment —</option>
                {equipmentList.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.type ? ` (${e.type})` : ""}
                  </option>
                ))}
              </select>
              <input name="equipmentStart" type="date" className="border rounded-md px-2 py-1.5 text-sm" />
              <input name="equipmentEnd" type="date" className="border rounded-md px-2 py-1.5 text-sm" />
              <button
                type="button"
                onClick={() => setEquipmentRows((r) => r.filter((x) => x !== id))}
                className="text-slate-400 hover:text-red-600 text-xs px-1"
                aria-label="Remove row"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Subcontractors */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Subcontractors (optional)</h3>
          <button
            type="button"
            onClick={() => setSubRows((r) => [...r, newId()])}
            className="text-xs text-blue-600 hover:underline"
          >
            + Add subcontractor
          </button>
        </div>
        <div className="space-y-2">
          {subRows.map((id) => (
            <div key={id} className="flex gap-2 items-center flex-wrap">
              <input name="subVendor" placeholder="Vendor" className="w-40 border rounded-md px-2 py-1.5 text-sm" />
              <input
                name="subDescription"
                placeholder="Scope"
                className="flex-1 min-w-[10rem] border rounded-md px-2 py-1.5 text-sm"
              />
              <input
                name="subAmount"
                type="number"
                step="any"
                placeholder="Committed $"
                className="w-28 border rounded-md px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => setSubRows((r) => r.filter((x) => x !== id))}
                className="text-slate-400 hover:text-red-600 text-xs px-1"
                aria-label="Remove row"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
