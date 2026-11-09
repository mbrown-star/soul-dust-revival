"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A transient "Saved" confirmation: call markSaved() right after a
 * successful save, and `saved` reads true for a couple of seconds before
 * clearing itself. Pulled out of LeaderResourceForm.tsx's own inline
 * version (the only admin form that had any saved-confirmation at all) so
 * every form that stays on the page after a save -- rather than navigating
 * away, which is its own implicit "it worked" signal -- can show the same
 * thing, instead of a Save button that flashes "Saving..." and reverts
 * with nothing to actually confirm the save landed.
 */
export function useSavedIndicator(durationMs = 2000) {
  const [saved, setSaved] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function markSaved() {
    setSaved(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setSaved(false), durationMs);
  }

  return { saved, markSaved };
}
