"use client";

import { useCallback, useState } from "react";

export const STUDY_TAB_KEYS = ["study", "passage", "work", "live", "lift"] as const;
export type StudyTabKey = (typeof STUDY_TAB_KEYS)[number];

function storageKeyFor(lessonId: string) {
  return `sdr-study-tabs-${lessonId}`;
}

function readDoneSet(lessonId: string): Set<StudyTabKey> {
  try {
    const raw = window.localStorage.getItem(storageKeyFor(lessonId));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * Tracks which of the 5 tabs a reader has finished for one week, mirroring
 * soul-dust-interactive's own per-week progress ring (localStorage only --
 * see useLocalProgress.ts's doc comment for why this doesn't need a server
 * round trip). Each tab's own component decides when it counts as "done"
 * (see StudyLessonView's usage).
 */
export function useTabProgress(lessonId: string) {
  const [done, setDoneState] = useState<Set<StudyTabKey>>(() => {
    if (typeof window === "undefined") return new Set();
    return readDoneSet(lessonId);
  });

  const setDone = useCallback(
    (tab: StudyTabKey, value: boolean) => {
      setDoneState((prev) => {
        if (prev.has(tab) === value) return prev;
        const next = new Set(prev);
        if (value) next.add(tab);
        else next.delete(tab);
        try {
          window.localStorage.setItem(storageKeyFor(lessonId), JSON.stringify([...next]));
        } catch {
          // ignore -- best-effort persistence only
        }
        return next;
      });
    },
    [lessonId]
  );

  const percent = Math.round((done.size / STUDY_TAB_KEYS.length) * 100);
  return { done, setDone, percent };
}

/** Reads another week's saved percent without subscribing to it -- used by the week-picker sheet to show each week's own progress. */
export function readTabProgressPercent(lessonId: string): number {
  if (typeof window === "undefined") return 0;
  return Math.round((readDoneSet(lessonId).size / STUDY_TAB_KEYS.length) * 100);
}
