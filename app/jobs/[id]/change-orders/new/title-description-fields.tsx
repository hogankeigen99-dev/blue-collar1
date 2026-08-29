"use client";

import { useState } from "react";

export default function TitleDescriptionFields({
  jobId,
  defaultTitle,
  defaultDescription,
  aiEnabled,
}: {
  jobId: string;
  defaultTitle: string;
  defaultDescription: string;
  aiEnabled: boolean;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function draftWithAi() {
    if (!description.trim()) {
      setError("Type some rough notes in the description field first, then draft from them.");
      return;
    }
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/draft-change-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, notes: description }),
      });
      const body = (await res.json()) as { title?: string; description?: string; error?: string };
      if (!res.ok || !body.title || !body.description) {
        setError(body.error ?? "Couldn't draft a change order right now.");
      } else {
        setTitle(body.title);
        setDescription(body.description);
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setDrafting(false);
    }
  }

  return (
    <>
      <div>
        <label className="block text-sm font-medium mb-1">Title *</label>
        <input
          name="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium">Description</label>
          {aiEnabled && (
            <button
              type="button"
              onClick={draftWithAi}
              disabled={drafting}
              className="text-xs text-blue-600 hover:underline disabled:opacity-50"
            >
              {drafting ? "Drafting…" : "Draft with AI"}
            </button>
          )}
        </div>
        <textarea
          name="description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={aiEnabled ? "Type rough notes, then click “Draft with AI” to clean them up" : undefined}
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    </>
  );
}
