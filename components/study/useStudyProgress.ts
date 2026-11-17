"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readStoredSet } from "@/lib/hooks/useStoredSet";
import {
  STORED_WEEK_PARTS,
  cleanStoredParts,
  finishedWeekParts,
  isStoredWeekPart,
  type StoredWeekPart,
  type WeekPart,
} from "@/lib/study/weekParts";

/** Where this week's tabs were kept before they were saved to the account. */
function legacyStorageKey(lessonId: string) {
  return `sdr-study-tabs-${lessonId}`;
}

async function saveWeekPart(lessonId: string, part: StoredWeekPart, done: boolean): Promise<StoredWeekPart[] | null> {
  try {
    const res = await fetch("/api/progress/parts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId, part, done }),
      // Tapping a step and leaving the page right away still saves it.
      keepalive: true,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { partsDone?: unknown[] };
    return cleanStoredParts(json.partsDone);
  } catch {
    return null;
  }
}

/**
 * The parts of one Study week this reader has finished, saved on their
 * account (lesson_progress.parts_done) so the tracker is the same on every
 * device. Starts from what the server loaded, so the first render matches
 * the server's HTML. Lift Up is `completed` (the week's own status), owned
 * by the Lift Up tab and reported back through `setCompleted`.
 */
export function useWeekParts(
  lessonId: string,
  initialPartsDone: readonly string[],
  initialCompleted: boolean,
  /** The parts this week shows (a week without a passage has no Passage tab). */
  shownParts: readonly WeekPart[]
) {
  const [stored, setStored] = useState<StoredWeekPart[]>(() => cleanStoredParts(initialPartsDone));
  const [completed, setCompleted] = useState(initialCompleted);
  const [error, setError] = useState<string | null>(null);
  // The latest write per part wins: a slower earlier response mustn't undo a later tap.
  const latestWrite = useRef(new Map<StoredWeekPart, number>());

  const setPartDone = useCallback(
    async (part: WeekPart, value: boolean) => {
      if (!isStoredWeekPart(part)) return;
      const apply = (on: boolean) =>
        setStored((current) => {
          if (current.includes(part) === on) return current;
          return cleanStoredParts(on ? [...current, part] : current.filter((p) => p !== part));
        });
      apply(value);
      setError(null);
      const writeId = (latestWrite.current.get(part) ?? 0) + 1;
      latestWrite.current.set(part, writeId);
      const saved = await saveWeekPart(lessonId, part, value);
      if (latestWrite.current.get(part) !== writeId) return;
      if (saved === null) {
        apply(!value);
        setError("Couldn’t save your progress. Check your connection and try again.");
      }
    },
    [lessonId]
  );

  // Progress from before it was saved to the account lives in this browser:
  // carry it over once, then forget the local copy.
  const carried = useRef(false);
  useEffect(() => {
    if (carried.current) return;
    carried.current = true;
    const key = legacyStorageKey(lessonId);
    // The old ring counted a missing Passage tab as done; only carry parts this week shows.
    const local = [...readStoredSet<string>(key)].filter(
      (p): p is StoredWeekPart => isStoredWeekPart(p) && shownParts.includes(p)
    );
    const initial = new Set(cleanStoredParts(initialPartsDone));
    const missing = STORED_WEEK_PARTS.filter((p) => local.includes(p) && !initial.has(p));
    void (async () => {
      let allSaved = true;
      for (const part of missing) {
        if (!(await saveWeekPart(lessonId, part, true))) allSaved = false;
        else setStored((current) => (current.includes(part) ? current : cleanStoredParts([...current, part])));
      }
      if (allSaved) {
        try {
          window.localStorage.removeItem(key);
        } catch {
          // Nothing to clean up.
        }
      }
    })();
    // Runs once per week, against what the page loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = useMemo(() => finishedWeekParts(stored, completed), [stored, completed]);
  return { done, setPartDone, completed, setCompleted, error };
}
