import { createVendor } from "@/lib/vendor-actions";
import { requirePageRole } from "@/lib/session";

export default async function NewVendorPage() {
  await requirePageRole("ADMIN", "PM");

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Add vendor</h1>
      <form action={createVendor} className="space-y-4 bg-white border rounded-lg p-6">
        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input name="name" required className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Trade</label>
          <input name="trade" placeholder="e.g. Electrical, Ready-mix concrete" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Contact info</label>
          <input name="contactInfo" placeholder="Phone, email, or contact name" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700">
          Add vendor
        </button>
      </form>
    </div>
  );
}
