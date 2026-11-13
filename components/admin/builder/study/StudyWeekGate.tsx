"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { StudyWeekContent } from "@/lib/study/studyContent";
import { emptyStudyWeekContent } from "@/lib/study/studyContentIssues";
import { StudyWeekBuilder } from "./StudyWeekBuilder";

/**
 * For a Study-kind lesson: the structured week builder if this lesson has a
 * week, otherwise an offer to start one. Starting doesn't save anything by
 * itself -- the week saves once its required fields are filled in, and until
 * then readers keep seeing this lesson's plain blocks.
 */
export function StudyWeekGate({
  lessonId,
  lessonTitle,
  initialContent,
  r2PublicBaseUrl,
  onFirstSave,
}: {
  lessonId: string;
  lessonTitle: string;
  initialContent: StudyWeekContent | null;
  r2PublicBaseUrl?: string;
  onFirstSave?: () => void;
}) {
  const [content, setContent] = useState(initialContent);

  if (!content && lessonTitle.trim().toLowerCase() === "introduction") {
    // An Introduction reads as its plain blocks: the offer stays folded away.
    return (
      <details className="border border-dashed border-moss/30 rounded-lg px-4 py-3 text-sm text-moss">
        <summary className="cursor-pointer">Build this as a week instead</summary>
        <p className="mt-2 max-w-prose">
          An Introduction shows readers its plain blocks below. Build a week only if this lesson should have the
          Study reader&apos;s five tabs.
        </p>
        <Button className="mt-3" onClick={() => setContent(emptyStudyWeekContent())}>Start building this week</Button>
      </details>
    );
  }

  if (!content) {
    return (
      <div className="border border-dashed border-moss/30 rounded-lg p-6 space-y-3">
        <h2 className="font-display text-lg text-ink">Start building this week</h2>
        <p className="text-sm text-moss max-w-prose">
          A week has the Study reader&apos;s five tabs: Study, Passage, Work the Word, Live It, and Lift Up. Until you
          start one, this lesson shows readers its plain blocks below — the right choice for an introduction or any
          lesson that isn&apos;t a full week.
        </p>
        <Button onClick={() => setContent(emptyStudyWeekContent())}>Start building this week</Button>
      </div>
    );
  }

  return (
    <StudyWeekBuilder
      lessonId={lessonId}
      initialContent={content}
      alreadySaved={initialContent !== null}
      r2PublicBaseUrl={r2PublicBaseUrl}
      onFirstSave={onFirstSave}
    />
  );
}
