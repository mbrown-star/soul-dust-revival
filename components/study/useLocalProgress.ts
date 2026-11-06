"use client";

import { useCallback, useState } from "react";

/**
 * Tracks a set of completed indexes (which of a week's 4 parts have been
 * read, which of its 5 practices are checked off) in localStorage, scoped
 * per lesson. This is UI chrome, not data the app reports on or needs to
 * sync across devices the way a saved answer or lesson completion is --
 * unlike those, it doesn't need a server round trip. Every read/write is
 * wrapped in try/catch since localStorage can throw (private browsing,
 * disabled storage), in which case this silently behaves as if nothing is
 * marked yet rather than breaking the page.
 */
export function useLocalProgress(storageKey: string): [Set<number>, (index: number) => void] {
  // Lazy initializer instead of an effect-driven setState: this still reads
  // localStorage only on the client (the window check), but does it once,
  // synchronously, during the first render of this component instance --
  // callers that need a fresh read per lesson should key the component by
  // lessonId (see StudyLessonView's usage) rather than relying on this
  // hook to react to a changed storageKey on an already-mounted instance.
  const [done, setDone] = useState<Set<number>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggle = useCallback(
    (index: number) => {
      setDone((prev) => {
        const next = new Set(prev);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        try {
          window.localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          // ignore -- best-effort persistence only
        }
        return next;
      });
    },
    [storageKey]
  );

  return [done, toggle];
}
