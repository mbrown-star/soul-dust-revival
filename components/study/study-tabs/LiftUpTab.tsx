"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { StudyWeekContent } from "@/lib/study/studyContent";
import { type LessonStatus, postLessonProgress, pendingLessonProgressPings } from "@/lib/study/lessonProgress";
import { WeekMediaSlot } from "../WeekMediaSlot";

/**
 * The week's closing tab -- and, per the recommendation discussed directly
 * with the user, the one tab whose "done" button is also the week's single
 * real, account-level completion signal (lesson_progress), the same way a
 * devotional day's one real signal is WalkedToggle. The other four tabs'
 * "done" buttons stay local-only self-tracking (see useStudyProgress.ts):
 * requiring all five, including Work the Word's forced answer+Greek-reveal
 * on every station, would make "mark this week done" impossible without
 * writing out five reflections, and tying real completion to localStorage
 * at all would stop it syncing across devices. One real action at the
 * natural end of the week's content avoids both problems. This replaces the
 * separate "Mark complete & continue" button LessonNavigation used to render
 * below every tab for a Study-kind week (see the lesson page's own comment).
 */
export function LiftUpTab({
  lessonId,
  content,
  initialStatus,
  nextHref,
  nextLabel = "Next week →",
  keepCompleted = false,
  isDone,
  onSetDone,
}: {
  lessonId: string;
  content: StudyWeekContent;
  initialStatus: LessonStatus;
  nextHref: string | null;
  nextLabel?: string;
  /**
   * A Journey week stays done once done: un-finishing it would lock every
   * stop opened since (they go in order), so the button can't undo.
   */
  keepCompleted?: boolean;
  isDone: boolean;
  onSetDone: (done: boolean) => void;
}) {
  // The real, server-synced status is the authoritative display state for
  // this button -- not the `isDone` prop, which is this week's local-only
  // tab-dot ring and could be unset on a fresh device even though the week
  // is already genuinely completed.
  const [completed, setCompleted] = useState(initialStatus === "completed");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reconcile the ring's "lift" dot to match reality on first load -- a
  // reader opening this week on a new device has no local tab-done state at
  // all, but if the week is already marked completed server-side, the dot
  // should reflect that immediately rather than looking unfinished.
  useEffect(() => {
    if (completed && !isDone) onSetDone(true);
    // Only ever needs to run once, against the server value this page loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle() {
    setSaving(true);
    setError(null);
    const next = !completed;
    const pendingPing = pendingLessonProgressPings.get(lessonId);
    if (pendingPing) await pendingPing;
    const ok = await postLessonProgress(lessonId, next ? "completed" : "not_started");
    if (!ok) {
      setError("Couldn't save your progress — please try again.");
      setSaving(false);
      return;
    }
    setCompleted(next);
    onSetDone(next);
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

      <div className="bg-white border border-dusk/10 rounded-xl p-6">
        <p className="font-serif italic text-lg text-ink">{content.closingVerse}</p>
        <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700 mt-3">{content.closingRef}</p>
      </div>

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
