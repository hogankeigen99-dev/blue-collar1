import { createWorker } from "@/lib/actions";
import { requirePageRole } from "@/lib/session";

export default async function NewWorkerPage() {
  await requirePageRole("ADMIN", "PM");

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Add worker</h1>
      <form action={createWorker} className="space-y-4 bg-white border rounded-lg p-6">
        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input name="name" required className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Role / trade</label>
          <input
            name="role"
            placeholder="e.g. Electrician"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Phone</label>
          <input name="phone" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input name="email" type="email" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <button
          type="submit"
          className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700"
        >
          Add worker
        </button>
      </form>
    </div>
  );
}
