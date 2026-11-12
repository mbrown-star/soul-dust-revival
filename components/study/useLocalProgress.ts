"use client";

import { useCallback } from "react";
import { useStoredSet } from "@/lib/hooks/useStoredSet";

/**
 * Tracks a set of completed indexes (which of a week's 4 parts have been
 * read, which of its 5 practices are checked off) in localStorage, scoped
 * per lesson. This is UI chrome, not data the app reports on or needs to
 * sync across devices the way a saved answer or lesson completion is --
 * unlike those, it doesn't need a server round trip. The first render
 * shows nothing marked, as the server does; saved marks appear right after
 * (useStoredSet). If localStorage is unavailable, marks still work for the
 * visit and just aren't remembered.
 */
export function useLocalProgress(storageKey: string): [Set<number>, (index: number) => void] {
  const [done, update] = useStoredSet<number>(storageKey);

  const toggle = useCallback(
    (index: number) => {
      update((current) => {
        const next = new Set(current);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      });
    },
    [update]
  );

  return [done, toggle];
}
