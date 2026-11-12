"use client";

import { useCallback } from "react";
import { readStoredSet, useStoredSet } from "@/lib/hooks/useStoredSet";

export const STUDY_TAB_KEYS = ["study", "passage", "work", "live", "lift"] as const;
export type StudyTabKey = (typeof STUDY_TAB_KEYS)[number];

function storageKeyFor(lessonId: string) {
  return `sdr-study-tabs-${lessonId}`;
}

/**
 * Tracks which of the 5 tabs a reader has finished for one week, mirroring
 * soul-dust-interactive's own per-week progress ring (localStorage only --
 * see useLocalProgress.ts's doc comment for why this doesn't need a server
 * round trip). Each tab's own component decides when it counts as "done"
 * (see StudyLessonView's usage). The first render shows nothing done, as
 * the server does; saved progress appears right after (useStoredSet).
 */
export function useTabProgress(lessonId: string) {
  const [done, update] = useStoredSet<StudyTabKey>(storageKeyFor(lessonId));

  const setDone = useCallback(
    (tab: StudyTabKey, value: boolean) => {
      update((current) => {
        if (current.has(tab) === value) return current;
        const next = new Set(current);
        if (value) next.add(tab);
        else next.delete(tab);
        return next;
      });
    },
    [update]
  );

  const percent = Math.round((done.size / STUDY_TAB_KEYS.length) * 100);
  return { done, setDone, percent };
}

/** Reads another week's saved percent without subscribing to it -- used by the week-picker sheet (drawn only once opened, so never during hydration). */
export function readTabProgressPercent(lessonId: string): number {
  if (typeof window === "undefined") return 0;
  return Math.round((readStoredSet<StudyTabKey>(storageKeyFor(lessonId)).size / STUDY_TAB_KEYS.length) * 100);
}
