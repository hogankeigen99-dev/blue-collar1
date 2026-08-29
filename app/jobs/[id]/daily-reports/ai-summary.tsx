"use client";

import { useState } from "react";

export default function AiSummaryPanel({ jobId }: { jobId: string }) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/summarize-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const body = (await res.json()) as { summary?: string; error?: string };
      if (!res.ok || !body.summary) {
        setError(body.error ?? "Couldn't generate a summary right now.");
      } else {
        setSummary(body.summary);
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">AI summary of recent field reports</div>
        <button
          onClick={generate}
          disabled={loading}
          className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? "Generating…" : summary ? "Regenerate" : "Generate summary"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {summary && <p className="text-sm text-slate-700 whitespace-pre-wrap">{summary}</p>}
    </div>
  );
}
