"use client";

import { useEffect, useRef } from "react";

// Closes a dropdown/menu on an outside click or Escape -- shared by the
// public nav (SiteNav's Profile dropdown and mobile hamburger) and the admin
// nav's mobile hamburger, which would otherwise each need the identical
// pointerdown/keydown wiring. Takes the state setter directly (not a generic
// callback) so it can stay in the effect's deps safely: a useState setter is
// referentially stable across renders.
export function useDismissibleMenu(open: boolean, setOpen: (open: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, setOpen]);

  return ref;
}
