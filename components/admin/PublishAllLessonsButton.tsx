"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// A document import creates every lesson as an unpublished draft for review
// (see app/api/admin/studies/import/route.ts) -- once review is done,
// toggling potentially hundreds of lessons one at a time isn't a reasonable
// workflow, so this does the whole study's set in one request.
export function PublishAllLessonsButton({
  studyId,
  lessonCount,
  unpublishedCount,
}: {
  studyId: string;
  lessonCount: number;
  unpublishedCount: number;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (lessonCount === 0 || unpublishedCount === 0) return null;

  async function handlePublishAll() {
    if (
      !window.confirm(
        `Publish all ${unpublishedCount} draft lesson${unpublishedCount === 1 ? "" : "s"} in this study? They'll become visible to anyone entitled to it.`
      )
    )
      return;

    setWorking(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/lessons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studyId, published: true }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({ message: "Couldn't publish those lessons." }))) as {
          message?: unknown;
        };
        setError(typeof data.message === "string" ? data.message : "Couldn't publish those lessons.");
        setWorking(false);
        return;
      }

      router.refresh();
    } catch {
      setError("Publish failed — the server didn't respond as expected. Please try again.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handlePublishAll}
        disabled={working}
        className="border border-moss/30 rounded-lg px-4 py-2 text-sm disabled:opacity-50"
      >
        {working ? "Publishing..." : `Publish all ${unpublishedCount} draft lesson${unpublishedCount === 1 ? "" : "s"}`}
      </button>
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
