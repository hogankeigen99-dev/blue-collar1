"use client";

export function ResetDemoButton({ action }: { action: () => void }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Reset the demo? This restores Mueller Construction Demo to its original seeded state — any changes made during this walkthrough will be lost.")) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="text-sm text-rose-200 hover:text-white hover:bg-rose-600/40 border border-rose-400/50 rounded-md px-2 py-1"
      >
        Reset Demo
      </button>
    </form>
  );
}
