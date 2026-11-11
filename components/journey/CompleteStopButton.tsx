"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { type LessonStatus, postLessonProgress, pendingLessonProgressPings } from "@/lib/study/lessonProgress";

/**
 * Finishes a Journey stop that has no completion control of its own (a
 * Part's threshold) and goes on: to the next stop if its week has come,
 * otherwise back to the Journey home. A finished stop stays finished --
 * stops go in order, so un-finishing one would lock everything after it.
 */
export function CompleteStopButton({
  lessonId,
  initialStatus,
  label,
  doneLabel,
  continueHref,
  continueLabel,
}: {
  lessonId: string;
  initialStatus: LessonStatus;
  label: string;
  doneLabel: string;
  continueHref: string;
  continueLabel: string;
}) {
  const router = useRouter();
  const [completed, setCompleted] = useState(initialStatus === "completed");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function complete() {
    setSaving(true);
    setError(null);
    const pendingPing = pendingLessonProgressPings.get(lessonId);
    if (pendingPing) await pendingPing;
    if (!(await postLessonProgress(lessonId, "completed"))) {
      setSaving(false);
      setError("Couldn't save your progress — please try again.");
      return;
    }
    setCompleted(true);
    router.push(continueHref);
  }

  if (completed) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-4">
        <span role="status" className="font-sans font-semibold text-sm text-moss">
          ✓ {doneLabel}
        </span>
        <Link
          href={continueHref}
          className="font-sans font-semibold text-sm text-moss hover:text-ink underline underline-offset-2"
        >
          {continueLabel}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={complete}
        disabled={saving}
        className="w-full min-h-[44px] rounded-full bg-ink text-parchment font-sans font-semibold text-sm disabled:opacity-50"
      >
        {saving ? "Saving…" : label}
      </button>
      {error && (
        <p role="alert" className="text-sm text-error text-center">
          {error}
        </p>
      )}
    </div>
  );
}
