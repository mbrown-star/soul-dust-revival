"use client";

import { useId, useState } from "react";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { StatusPill } from "./BlockCard";

type LessonMeta = { title: string; published: boolean; isSample: boolean };

/** Lesson title (edited in place), Published and Free sample toggles, and a reader preview link. */
export function LessonHeader({
  lessonId,
  initialTitle,
  initialPublished,
  initialIsSample,
  previewHref,
}: {
  lessonId: string;
  initialTitle: string;
  initialPublished: boolean;
  initialIsSample: boolean;
  previewHref: string;
}) {
  const titleId = useId();
  const sampleHintId = useId();
  const [meta, setMeta] = useState<LessonMeta>({ title: initialTitle, published: initialPublished, isSample: initialIsSample });
  const autosave = useAutosave<LessonMeta>(async (patch, { keepalive }) => {
    const res = await fetch("/api/admin/lessons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lessonId, ...patch }),
      keepalive,
    });
    if (!res.ok) throw new Error("Couldn't save the lesson title or settings.");
  });

  function update(patch: Partial<LessonMeta>) {
    const next = { ...meta, ...patch };
    setMeta(next);
    if (next.title.trim()) autosave.schedule(next);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex-1 min-w-0">
        <label htmlFor={titleId} className="block text-xs uppercase tracking-wide text-moss mb-1">
          Lesson title
        </label>
        <input
          id={titleId}
          value={meta.title}
          maxLength={200}
          aria-invalid={!meta.title.trim()}
          onChange={(e) => update({ title: e.target.value })}
          className="w-full font-display text-2xl text-ink bg-transparent border-b border-moss/20 focus:border-ink focus:outline-none py-1"
        />
        {!meta.title.trim() && <p className="text-xs text-error mt-1">A lesson needs a title.</p>}
        {meta.isSample && (
          <p id={sampleHintId} className="text-xs text-moss mt-1">
            Free sample: any signed-in reader can open this lesson without buying the study, once both this lesson and
            the study are published.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span role="status" aria-live="polite">
          {autosave.status === "saving" || autosave.status === "pending" ? (
            <StatusPill tone="muted">Saving…</StatusPill>
          ) : autosave.status === "error" ? (
            <StatusPill tone="error">{autosave.error}</StatusPill>
          ) : null}
        </span>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={meta.published} onChange={(e) => update({ published: e.target.checked })} />
          Published
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={meta.isSample}
            aria-describedby={meta.isSample ? sampleHintId : undefined}
            onChange={(e) => update({ isSample: e.target.checked })}
          />
          Free sample
        </label>
        <a
          href={previewHref}
          target="_blank"
          rel="noopener"
          className="text-sm px-3 py-2 rounded-lg border border-moss/20 bg-parchment text-ink hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          Preview as reader ↗
        </a>
      </div>
    </div>
  );
}
