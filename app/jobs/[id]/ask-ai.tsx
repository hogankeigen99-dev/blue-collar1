"use client";

import { useState } from "react";

type Exchange = { question: string; answer: string };

export default function AskAiPanel({ jobId }: { jobId: string }) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, question: q }),
      });
      const body = (await res.json()) as { answer?: string; error?: string };
      if (!res.ok || !body.answer) {
        setError(body.error ?? "Couldn't answer that right now.");
      } else {
        setHistory((h) => [...h, { question: q, answer: body.answer! }]);
        setQuestion("");
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border rounded-lg p-4 space-y-3">
      <div className="text-sm font-medium">Ask about this job</div>
      <p className="text-xs text-slate-500">
        Grounded in this job&apos;s real costing, billing readiness, change orders, materials, and recent
        daily reports — not a general chatbot.
      </p>

      {history.length > 0 && (
        <div className="space-y-3 border-t pt-3">
          {history.map((h, i) => (
            <div key={i} className="text-sm">
              <div className="font-medium text-slate-700">{h.question}</div>
              <p className="text-slate-600 whitespace-pre-wrap mt-0.5">{h.answer}</p>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <form onSubmit={ask} className="flex items-end gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Are we missing any billing items before closeout?"
          className="flex-1 border rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? "Asking…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
