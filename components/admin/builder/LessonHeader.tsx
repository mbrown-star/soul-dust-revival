"use client";

import { useCallback, useId, useState } from "react";
import { flushAllAutosaves, useAutosave } from "@/lib/hooks/useAutosave";
import { useDraftChanged } from "@/lib/builder/draftEvents";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "./BlockCard";

type LessonMeta = { title: string; published: boolean; isSample: boolean };

/**
 * Lesson title (edited in place), Published and Free sample toggles, a reader
 * preview link, and -- for a published lesson -- draft and publish: edits save
 * as a draft (readers keep the published version) until "Publish changes".
 * See lib/lessons/publishedContent.ts.
 */
export function LessonHeader({
  lessonId,
  initialTitle,
  initialPublished,
  initialIsSample,
  initialHasDraftChanges,
  previewHref,
}: {
  lessonId: string;
  initialTitle: string;
  initialPublished: boolean;
  initialIsSample: boolean;
  initialHasDraftChanges: boolean;
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

  const [hasDraft, setHasDraft] = useState(initialPublished && initialHasDraftChanges);
  const [publishing, setPublishing] = useState<"publish" | "discard" | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  // A save to a published lesson's content leaves it with unpublished changes.
  const published = meta.published;
  useDraftChanged(
    useCallback(() => {
      if (published) {
        setHasDraft(true);
        setNotice(null);
      }
    }, [published])
  );

  function update(patch: Partial<LessonMeta>) {
    const next = { ...meta, ...patch };
    setMeta(next);
    // Publishing freezes the current content; unpublishing drops the
    // published version. Either way there's nothing pending afterward.
    if (patch.published !== undefined && patch.published !== meta.published) {
      setHasDraft(false);
      setNotice(null);
    }
    if (next.title.trim()) autosave.schedule(next);
  }

  async function runAction(action: "publishChanges" | "discardChanges") {
    setPublishing(action === "publishChanges" ? "publish" : "discard");
    setNotice(null);
    try {
      // Everything typed so far must be saved first -- otherwise Publish could
      // freeze the lesson without the last edit, or an edit could land after a
      // Discard and bring the draft straight back.
      if (!(await flushAllAutosaves())) {
        setNotice({ tone: "error", text: "Some changes couldn't be saved -- fix or retry them first." });
        return;
      }
      const res = await fetch("/api/admin/lessons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lessonId, action }),
      }).catch(() => null);
      if (!res || !res.ok) {
        const data = res ? ((await res.json().catch(() => ({}))) as { message?: string }) : {};
        setNotice({ tone: "error", text: data.message ?? "That didn't go through. Check your connection and try again." });
        return;
      }
      if (action === "discardChanges") {
        // The builders hold their own copies of the content; reload to show
        // the restored version.
        window.location.reload();
        return;
      }
      setHasDraft(false);
      setNotice({ tone: "success", text: "Published. Readers now see these changes." });
    } finally {
      setPublishing(null);
    }
  }

  function discard() {
    if (!window.confirm("Discard all unpublished changes to this lesson? It goes back to the version readers see now.")) return;
    void runAction("discardChanges");
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
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
          href={meta.published && hasDraft ? `${previewHref}?draft=1` : previewHref}
          target="_blank"
          rel="noopener"
          className="text-sm px-3 py-2 rounded-lg border border-moss/20 bg-parchment text-ink hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          Preview as reader ↗
        </a>
      </div>
      {meta.published && (
        <div className="w-full basis-full rounded-lg border border-moss/15 bg-gold/10 px-4 py-3 flex flex-wrap items-center gap-3">
          <StatusPill tone={hasDraft ? "muted" : "success"}>{hasDraft ? "Unpublished changes" : "Live"}</StatusPill>
          <p className="flex-1 min-w-[14rem] text-sm text-ink">
            {hasDraft
              ? "Readers still see the published version. Preview your changes, then publish them or discard them."
              : "Readers see this lesson as it is now. Edits you make save as a draft until you publish them."}
          </p>
          {hasDraft && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void runAction("publishChanges")} disabled={publishing !== null}>
                {publishing === "publish" ? "Publishing…" : "Publish changes"}
              </Button>
              <Button size="sm" variant="secondary" onClick={discard} disabled={publishing !== null}>
                {publishing === "discard" ? "Discarding…" : "Discard changes"}
              </Button>
            </div>
          )}
          <p role={notice?.tone === "error" ? "alert" : "status"} className={`basis-full text-sm ${notice?.tone === "error" ? "text-error" : "text-success"}`}>
            {notice?.text}
          </p>
        </div>
      )}
    </div>
  );
}
