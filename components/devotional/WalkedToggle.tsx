"use client";

import { useState } from "react";
import { postLessonProgress, pendingLessonProgressPings } from "@/lib/study/lessonProgress";

/**
 * "I walked today" -- toggles this lesson's own lesson_progress between
 * completed/not_started in place, without navigating away (unlike
 * LessonNavigation's "Mark complete & continue", built for a linear
 * study where finishing a lesson means moving to the next one; a devotional
 * reader stays on the same day to re-read, answer, or just sit with it).
 * Reuses the same /api/progress endpoint and status values.
 */
export function WalkedToggle({
  lessonId,
  initialWalked,
  nextDayLabel,
}: {
  lessonId: string;
  initialWalked: boolean;
  nextDayLabel: string | null;
}) {
  const [walked, setWalked] = useState(initialWalked);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setSaving(true);
    setError(null);
    const nextWalked = !walked;
    // See lib/study/lessonProgress.ts -- wait for this lesson's own "mark in
    // progress" ping, if one is still in flight, so it can't resolve after
    // and clobber this write.
    const pendingPing = pendingLessonProgressPings.get(lessonId);
    if (pendingPing) await pendingPing;
    const ok = await postLessonProgress(lessonId, nextWalked ? "completed" : "not_started");
    if (!ok) {
      setError("Couldn't save your progress — please try again.");
      setSaving(false);
      return;
    }
    setWalked(nextWalked);
    setSaving(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-moss/10 pt-6">
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className={`min-h-[44px] rounded-full px-6 font-sans font-semibold text-sm disabled:opacity-50 ${
          walked ? "bg-moss text-white" : "bg-ink text-parchment"
        }`}
      >
        {saving ? "Saving…" : walked ? "✓ Walked" : "I walked today"}
      </button>
      {!walked && nextDayLabel && (
        <span className="font-sans text-sm text-moss">{nextDayLabel} is next whenever you&apos;re ready.</span>
      )}
      {error && (
        <p role="alert" className="w-full text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
