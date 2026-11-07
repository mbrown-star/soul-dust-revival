"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { StudyContentEditor } from "./StudyContentEditor";
import type { StudyWeekContent } from "@/lib/study/studyContent";

function emptyStudyWeekContent(): StudyWeekContent {
  return {
    subtitle: "",
    keyVerse: "",
    keyRef: "",
    study: { sections: [], parts: [] },
    passageRef: "",
    passage: [],
    stationsLabel: "Work the Word",
    stationsIntro: "",
    stations: [],
    lifeTitle: "",
    lifeIntro: "",
    practices: [],
    prayerLead: "",
    prayerBeats: [],
    prayerClose: "",
    bottomLine: [],
    benediction: [],
    closingVerse: "",
    closingRef: "",
    carry: "",
  };
}

// Gates between "this lesson already has structured Study content" (the
// common case for a real, already-backfilled week) and "it doesn't yet" --
// a brand-new lesson for a Study-kind study, or one imported before this
// editor existed. Previously there was no way to create this content for a
// new week at all except by re-running a one-off script.
export function StudyContentEditorGate({
  lessonId,
  initialContent,
}: {
  lessonId: string;
  initialContent: StudyWeekContent | null;
}) {
  const [content, setContent] = useState(initialContent);

  if (!content) {
    return (
      <div className="border border-dashed border-moss/30 rounded-lg p-6 text-center space-y-3">
        <p className="text-sm text-moss">
          This lesson has no structured Study content yet -- it&apos;s shown with the plain content-block
          reading view below until it does.
        </p>
        <Button onClick={() => setContent(emptyStudyWeekContent())}>Create structured Study content</Button>
      </div>
    );
  }

  return <StudyContentEditor lessonId={lessonId} initialContent={content} />;
}
