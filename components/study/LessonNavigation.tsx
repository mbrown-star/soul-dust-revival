"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type LessonStatus = "not_started" | "in_progress" | "completed";

async function postProgress(lessonId: string, status: LessonStatus) {
  try {
    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId, status }),
    });
  } catch {
    // Best-effort -- a failed progress ping shouldn't interrupt reading.
  }
}

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
}: {
  studyHref: string;
  studyTitle: string;
  lessonId: string;
  initialStatus: LessonStatus;
  previousHref: string | null;
  nextHref: string | null;
  position: "top" | "bottom";
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    if (position === "top" && initialStatus === "not_started") {
      postProgress(lessonId, "in_progress");
    }
    // Only ever needs to fire once, on the very first mount of this lesson page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleMarkComplete() {
    setCompleting(true);
    await postProgress(lessonId, "completed");
    setStatus("completed");
    router.push(nextHref ?? studyHref);
    router.refresh();
  }

  if (position === "top") {
    return (
      <nav aria-label="Lesson navigation" className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href={studyHref} className="text-moss hover:text-ink underline underline-offset-2">
          ← {studyTitle}
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
        ← Back to table of contents
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
            {completing ? "Saving..." : nextHref ? "Mark complete & continue" : "Mark complete & finish"}
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
    </div>
  );
}
