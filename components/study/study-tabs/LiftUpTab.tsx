"use client";

import { useState } from "react";
import Link from "next/link";
import type { StudyWeekContent } from "@/lib/study/studyContent";
import { postLessonProgress, pendingLessonProgressPings } from "@/lib/study/lessonProgress";
import { WeekMediaSlot } from "../WeekMediaSlot";

/**
 * The week's closing tab. Its button is the week's one real completion
 * (lesson_progress.status), the same signal My Library reads, and Lift Up's
 * step in the week tracker is that same value (lib/study/weekParts.ts), so
 * the tracker and the Library can't disagree. The other four parts are
 * saved separately (useWeekParts) and never decide completion: requiring all
 * five, including every Work the Word answer, would make finishing a week
 * depend on writing five reflections.
 */
export function LiftUpTab({
  lessonId,
  content,
  completed,
  onCompletedChange,
  otherPartsDone,
  nextHref,
  nextLabel = "Next week →",
  keepCompleted = false,
}: {
  lessonId: string;
  content: StudyWeekContent;
  /** The week's saved status, owned by StudyLessonView. */
  completed: boolean;
  onCompletedChange: (completed: boolean) => void;
  /** Whether any other part is finished: un-completing then leaves the week in progress, not unstarted. */
  otherPartsDone: boolean;
  nextHref: string | null;
  nextLabel?: string;
  /**
   * A Journey week stays done once done: un-finishing it would lock every
   * stop opened since (they go in order), so the button can't undo.
   */
  keepCompleted?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setSaving(true);
    setError(null);
    const next = !completed;
    const pendingPing = pendingLessonProgressPings.get(lessonId);
    if (pendingPing) await pendingPing;
    const ok = await postLessonProgress(lessonId, next ? "completed" : otherPartsDone ? "in_progress" : "not_started");
    if (!ok) {
      setError("Couldn't save your progress — please try again.");
      setSaving(false);
      return;
    }
    onCompletedChange(next);
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="bg-ink text-parchment rounded-xl p-6 space-y-3">
        <p className="font-sans text-xs font-semibold uppercase tracking-wide text-gold">Benediction</p>
        {content.benediction.map((p, i) => (
          <p key={i} className="font-serif text-lg">
            {p}
          </p>
        ))}
      </div>

      <p aria-hidden="true" className="text-center tracking-[0.5em] text-ember-700">
        ◆◆◆
      </p>

      {/* Some weeks end the benediction with the authors' name instead of a verse (Prayer). */}
      {content.closingVerse && (
        <div className="bg-white border border-dusk/10 rounded-xl p-6">
          <p className="font-serif italic text-lg text-ink">{content.closingVerse}</p>
          {content.closingRef && (
            <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700 mt-3">{content.closingRef}</p>
          )}
        </div>
      )}

      <div className="bg-ink text-parchment rounded-xl p-6">
        <p className="font-sans text-xs font-semibold uppercase tracking-wide text-gold mb-2">Quiet Question to Carry</p>
        <p className="font-serif italic text-lg">{content.carry}</p>
      </div>

      <WeekMediaSlot slot="tab:lift" />

      <button
        type="button"
        onClick={toggle}
        disabled={saving || (keepCompleted && completed)}
        className={`w-full min-h-[44px] rounded-full font-sans font-semibold text-sm disabled:opacity-50 ${
          completed ? "bg-moss text-white" : "bg-ink text-parchment"
        }`}
      >
        {saving ? "Saving…" : completed ? "✓ Carried into the day" : "Carry it into the day"}
      </button>

      {completed && nextHref && (
        <Link
          href={nextHref}
          className="block text-center text-sm font-sans font-semibold text-moss hover:text-ink underline underline-offset-2"
        >
          {nextLabel}
        </Link>
      )}

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
