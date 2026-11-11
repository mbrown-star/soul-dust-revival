"use client";

import { useEffect } from "react";

// The lesson builder's saves happen in several components (each block card,
// the block list, the week builder); the lesson header shows whether the
// lesson now has unpublished changes. A window event links them without
// threading callbacks through every builder component. One lesson is edited
// per page, so the event needs no payload.
const EVENT = "lesson-draft-changed";

/** Call after any successful save to the lesson's working copy. */
export function notifyDraftChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

/** Runs `onChange` whenever the working copy is saved. */
export function useDraftChanged(onChange: () => void): void {
  useEffect(() => {
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [onChange]);
}
