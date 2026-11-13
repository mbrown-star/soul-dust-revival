"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { type LessonStatus, postLessonProgress, pendingLessonProgressPings } from "@/lib/study/lessonProgress";
import { shortStudyTitle } from "@/lib/study/shortStudyTitle";

/**
 * Sits at the top and bottom of a lesson: a "back to contents" link plus
 * previous/next lesson links, and (at the bottom) the "mark complete"
 * control. Also pings progress to "in_progress" once on mount if the lesson
 * hadn't been started yet, so a lesson a user has opened but not finished
 * shows correctly in the study's own progress list and My Library.
 */
export function LessonNavigation({
  studyHref,
  studyTitle,
  lessonId,
  initialStatus,
  previousHref,
  nextHref,
  position,
  visible = true,
  backLabel,
  continueHref,
}: {
  studyHref: string;
  studyTitle: string;
  lessonId: string;
  initialStatus: LessonStatus;
  previousHref: string | null;
  nextHref: string | null;
  position: "top" | "bottom";
  // The devotional reader (DevotionalDayView) has its own prev/next header
  // and doesn't want this one's markup duplicated -- but the "mark in
  // progress on view" ping (position="top") still needs to fire, so this
  // mounts normally and just renders nothing rather than being left out of
  // the tree entirely.
  visible?: boolean;
  /** Bottom back link's text; defaults to the study's short title, as the top one. */
  backLabel?: string;
  /** Where "Mark complete" leads; defaults to the next lesson, else the contents. */
  continueHref?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (position === "top" && initialStatus === "not_started") {
      pendingLessonProgressPings.set(lessonId, postLessonProgress(lessonId, "in_progress"));
    }
    // Only ever needs to fire once, on the very first mount of this lesson page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleMarkComplete() {
    setCompleting(true);
    setError(null);
    // Wait for the "in progress" ping, if one is still in flight, so it can
    // never resolve after and clobber the completed write that's about to go out.
    const pendingPing = pendingLessonProgressPings.get(lessonId);
    if (pendingPing) await pendingPing;
    const ok = await postLessonProgress(lessonId, "completed");
    if (!ok) {
      setCompleting(false);
      setError("Couldn't save your progress — please try again.");
      return;
    }
    setStatus("completed");
    router.push(continueHref ?? nextHref ?? studyHref);
  }

  if (!visible) return null;

  if (position === "top") {
    return (
      <nav aria-label="Lesson navigation" className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href={studyHref} className="text-moss hover:text-ink underline underline-offset-2">
          ← {shortStudyTitle(studyTitle)}
        </Link>
        <div className="flex items-center gap-4">
          {previousHref && (
            <Link href={previousHref} className="text-moss hover:text-ink underline underline-offset-2">
              ← Previous
            </Link>
          )}
          {nextHref && (
            <Link href={nextHref} className="text-moss hover:text-ink underline underline-offset-2">
              Next →
            </Link>
          )}
        </div>
      </nav>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-moss/10 pt-6">
      <Link href={studyHref} className="text-sm text-moss hover:text-ink underline underline-offset-2">
        ← {backLabel ?? shortStudyTitle(studyTitle)}
      </Link>
      <div className="flex items-center gap-4">
        {previousHref && (
          <Link
            href={previousHref}
            className="text-sm border border-moss/30 rounded-lg px-4 py-2 min-h-[44px] flex items-center hover:border-moss/60"
          >
            ← Previous
          </Link>
        )}
        {status === "completed" ? (
          <span className="text-sm font-medium text-moss inline-flex items-center gap-1" role="status">
            ✓ Completed
          </span>
        ) : (
          <button
            type="button"
            onClick={handleMarkComplete}
            disabled={completing}
            className="bg-ink text-white rounded-lg px-5 py-2 text-sm font-medium min-h-[44px] disabled:opacity-50"
          >
            {completing
              ? "Saving..."
              : (continueHref ?? nextHref)
                ? "Mark complete & continue"
                : "Mark complete & finish"}
          </button>
        )}
        {status === "completed" && nextHref && (
          <Link
            href={nextHref}
            className="text-sm border border-moss/30 rounded-lg px-4 py-2 min-h-[44px] flex items-center hover:border-moss/60"
          >
            Next →
          </Link>
        )}
      </div>
      {error && (
        <p role="alert" className="w-full text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
