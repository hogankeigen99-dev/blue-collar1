"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { SmallProjectStep } from "@/lib/small-project-flow";

// Same useSyncExternalStore pattern as walkthrough-panel.tsx (see its
// comment) — a second, independent sessionStorage key so the two
// walkthroughs never collide if both get opened.
const STORAGE_KEY = "crewsync-small-project-step";
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
    // sessionStorage unavailable — flow still works, just won't persist across nav
  }
  listeners.forEach((l) => l());
}

const PROPAGATION_CHAIN = [
  "Daily Report",
  "Production",
  "Labor Productivity",
  "Job Cost",
  "Labor Forecast",
  "PM Exception",
  "Project Margin Forecast",
  "Company Command",
];

export function SmallProjectLauncher({ steps }: { steps: SmallProjectStep[] }) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const router = useRouter();

  if (raw !== null) {
    const index = Math.min(Math.max(Number(raw) || 0, 0), steps.length - 1);
    return <SmallProjectPanel steps={steps} index={index} router={router} />;
  }

  return (
    <button
      type="button"
      onClick={() => {
        setStep("0");
        router.push(steps[0].href);
      }}
      className="text-sm text-amber-200 hover:text-white border border-amber-400/50 rounded-md px-2 py-1 font-medium"
    >
      Run Small Project Demo
    </button>
  );
}

function SmallProjectPanel({
  steps,
  index,
  router,
}: {
  steps: SmallProjectStep[];
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
    <div className="fixed bottom-4 left-4 z-50 w-96 bg-white border border-slate-300 rounded-lg shadow-xl p-4 max-h-[80vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs uppercase tracking-wide text-amber-700 font-semibold">
          Small Project Live Flow — {index + 1} of {steps.length}
        </span>
        <button type="button" onClick={() => setStep(null)} className="text-xs text-slate-400 hover:text-slate-700">
          Exit
        </button>
      </div>
      <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-0.5">{step.day}</div>
      <div className="font-semibold text-slate-900 mb-1">{step.label}</div>
      <p className="text-sm text-slate-600 mb-3">{step.blurb}</p>

      {step.kind === "propagation" && (
        <div className="mb-3 bg-slate-900 text-white rounded-md p-3 text-center">
          <div className="text-xs space-y-1">
            {PROPAGATION_CHAIN.map((item, i) => (
              <div key={item}>
                {item}
                {i < PROPAGATION_CHAIN.length - 1 && <div className="text-slate-500">&darr;</div>}
              </div>
            ))}
          </div>
          <div className="mt-2 font-semibold text-amber-300 text-sm">
            ENTER ONCE &rarr; CREWSYNC HANDLES THE REST
          </div>
        </div>
      )}

      {step.kind === "summary" && (
        <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
          <div className="bg-red-50 border border-red-200 rounded-md p-2">
            <div className="font-semibold text-red-700 mb-1">Without CrewSync</div>
            <ul className="space-y-0.5 text-red-800">
              <li>Multiple handoffs</li>
              <li>Duplicate entry</li>
              <li>PM chasing field updates</li>
              <li>Accounting chasing PM</li>
              <li>Labor overruns discovered late</li>
              <li>Change work missed</li>
              <li>Historical production unused</li>
            </ul>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-md p-2">
            <div className="font-semibold text-green-700 mb-1">With CrewSync</div>
            <ul className="space-y-0.5 text-green-800">
              <li>Enter once</li>
              <li>Automatic handoffs</li>
              <li>Real-time productivity</li>
              <li>Exception-driven PM workflow</li>
              <li>Automatic job-cost forecasting</li>
              <li>Field-to-CO connection</li>
              <li>Billing readiness</li>
              <li>Closed-loop estimating intelligence</li>
            </ul>
          </div>
        </div>
      )}

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
            className="text-sm px-3 py-1 rounded-md bg-amber-600 text-white hover:bg-amber-700"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep(null)}
            className="text-sm px-3 py-1 rounded-md bg-amber-600 text-white hover:bg-amber-700"
          >
            Finish
          </button>
        )}
      </div>
    </div>
  );
}
