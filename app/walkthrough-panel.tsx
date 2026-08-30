"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { WalkthroughStep } from "@/lib/walkthrough";

// sessionStorage is the source of truth for "which step am I on" — read via
// useSyncExternalStore (not useState+useEffect) so the very first client
// render already has the right answer instead of a synchronous setState
// inside an effect (flagged by react-hooks/set-state-in-effect), and so a
// server-rendered pass always agrees with getServerSnapshot rather than
// risking a hydration mismatch.
const STORAGE_KEY = "crewsync-walkthrough-step";
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getServerSnapshot(): string | null {
  return null;
}

function setStep(value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    // sessionStorage unavailable — walkthrough still works, just won't persist across nav
  }
  listeners.forEach((l) => l());
}

export function WalkthroughLauncher({ steps }: { steps: WalkthroughStep[] }) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const router = useRouter();

  if (raw !== null) {
    const index = Math.min(Math.max(Number(raw) || 0, 0), steps.length - 1);
    return <WalkthroughPanel steps={steps} index={index} router={router} />;
  }

  return (
    <button
      type="button"
      onClick={() => {
        setStep("0");
        router.push(steps[0].href);
      }}
      className="text-sm text-brand-200 hover:text-white border border-brand-400/50 rounded-md px-2 py-1"
    >
      Walkthrough
    </button>
  );
}

function WalkthroughPanel({
  steps,
  index,
  router,
}: {
  steps: WalkthroughStep[];
  index: number;
  router: ReturnType<typeof useRouter>;
}) {
  function goTo(next: number) {
    const clamped = Math.min(Math.max(next, 0), steps.length - 1);
    setStep(String(clamped));
    router.push(steps[clamped].href);
  }

  const step = steps[index];

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-white border border-slate-300 rounded-lg shadow-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs uppercase tracking-wide text-blue-700 font-semibold">
          Walkthrough — step {index + 1} of {steps.length}
        </span>
        <button type="button" onClick={() => setStep(null)} className="text-xs text-slate-400 hover:text-slate-700">
          Exit Walkthrough
        </button>
      </div>
      <div className="font-semibold text-slate-900 mb-1">{step.label}</div>
      <p className="text-sm text-slate-600 mb-3">{step.blurb}</p>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          className="text-sm px-3 py-1 rounded-md border border-slate-300 text-slate-700 disabled:opacity-40"
        >
          Back
        </button>
        {index < steps.length - 1 ? (
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            className="text-sm px-3 py-1 rounded-md bg-brand-600 text-white hover:bg-brand-700"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep(null)}
            className="text-sm px-3 py-1 rounded-md bg-brand-600 text-white hover:bg-brand-700"
          >
            Finish
          </button>
        )}
      </div>
    </div>
  );
}
