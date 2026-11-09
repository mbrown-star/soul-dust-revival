"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// There's no sensible partial-merge story for "upload a different document"
// the way scripts/reprocess-study-lessons.ts has for re-parsing the *same*
// source with a fixed parser -- a revised manuscript can freely add, remove,
// rename, or reorder sections, so this replaces every lesson in the study
// wholesale (see app/api/admin/studies/reimport/route.ts). Confirmed with a
// native confirm() before anything happens, same pattern as
// PublishAllLessonsButton; the route itself refuses (409) once the study's
// linked product has real order/entitlement history, same safety check the
// study DELETE route already applies.
export function ReimportStudyForm({ studyId, lessonCount }: { studyId: string; lessonCount: number }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(file: File) {
    const confirmed = window.confirm(
      lessonCount > 0
        ? `This replaces all ${lessonCount} existing lesson${lessonCount === 1 ? "" : "s"} in this study with lessons parsed from "${file.name}". The study will be set back to unpublished for review. This can't be undone. Continue?`
        : `This creates lessons in this study from "${file.name}". The study will be set back to unpublished for review. Continue?`
    );
    if (!confirmed) return;

    setWorking(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("studyId", studyId);

    try {
      const res = await fetch("/api/admin/studies/reimport", { method: "POST", body: formData });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Reimport failed.");
        setWorking(false);
        return;
      }
    } catch {
      setError("Reimport failed — the server didn't respond as expected. Please try again.");
      setWorking(false);
      return;
    }

    router.refresh();
    setWorking(false);
  }

  return (
    <div className="space-y-2">
      <label className="inline-block">
        <span className="border border-moss/30 rounded-lg px-4 py-2 text-sm cursor-pointer inline-block disabled:opacity-50">
          {working ? "Reimporting..." : "Re-upload materials (.docx or .pdf)"}
        </span>
        <input
          type="file"
          accept=".docx,.pdf"
          className="sr-only"
          disabled={working}
          onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      {working && (
        <div className="space-y-2">
          <div className="w-full h-1.5 bg-moss/10 rounded-full overflow-hidden" aria-hidden="true">
            <div className="h-full w-1/3 bg-ink rounded-full indeterminate-bar" />
          </div>
          <p role="status" aria-live="polite" className="text-sm text-moss">
            Parsing the new document and replacing this study&apos;s lessons — this can take a minute or two
            for longer files. Don&apos;t close this page.
          </p>
        </div>
      )}

      <p className="text-xs text-moss">
        Replaces every lesson in this study with lessons parsed from the new file, and sets the study back to
        unpublished for review.
      </p>
    </div>
  );
}
