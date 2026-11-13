"use client";

import { useState } from "react";
import type { StudyWeekContent } from "@/lib/study/studyContent";
import type { ContentBlockData } from "@/lib/content/blocks";
import { LessonBuilder } from "./LessonBuilder";
import { StudyWeekGate } from "./study/StudyWeekGate";
import type { StudyKind } from "./blockEditors";

/**
 * Which editors a lesson shows: the week builder for a Study-kind lesson,
 * and the free-form block canvas unless that lesson already has a week (its
 * blocks are then just the stations' answer plumbing). Decided here on the
 * client so the canvas goes away the moment a new week first saves, instead
 * of waiting on a background page refresh (which staging was aborting).
 */
export function LessonEditorBody({
  lessonId,
  lessonTitle,
  isStudyKind,
  studyKind,
  initialStudyContent,
  initialBlocks,
  r2PublicBaseUrl,
}: {
  lessonId: string;
  lessonTitle: string;
  isStudyKind: boolean;
  studyKind: StudyKind;
  initialStudyContent: StudyWeekContent | null;
  initialBlocks: ContentBlockData[];
  r2PublicBaseUrl?: string;
}) {
  const [hasWeek, setHasWeek] = useState(isStudyKind && initialStudyContent !== null);

  return (
    <>
      {isStudyKind && (
        <StudyWeekGate
          lessonId={lessonId}
          lessonTitle={lessonTitle}
          initialContent={initialStudyContent}
          r2PublicBaseUrl={r2PublicBaseUrl}
          onFirstSave={() => setHasWeek(true)}
        />
      )}
      {!hasWeek && (
        <LessonBuilder
          lessonId={lessonId}
          initialBlocks={initialBlocks}
          studyKind={studyKind}
          r2PublicBaseUrl={r2PublicBaseUrl}
        />
      )}
    </>
  );
}
