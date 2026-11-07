"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * Tracks whether a horizontally-scrollable element is scrolled away from its
 * start/end edges, so a caller can show a fade or other affordance hinting
 * there's more content to scroll to -- overflow-x-auto alone gives no visual
 * sign anything is cut off at the viewport's edge (the exact gap found in
 * SiteNav.tsx's old scrollable strip, CLAUDE.md 2026-11-07, and again in the
 * Study/Devotional reader's own scrollable tab bars).
 */
export function useScrollEdges<T extends HTMLElement>(): {
  ref: RefObject<T | null>;
  atStart: boolean;
  atEnd: boolean;
} {
  const ref = useRef<T>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  // useLayoutEffect, not useEffect -- measures and sets the initial fade
  // state before the browser paints, so a tab bar that's actually scrollable
  // never briefly renders with no affordance at all on first paint.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    function update() {
      if (!el) return;
      setAtStart(el.scrollLeft <= 0);
      // A 1px tolerance -- fractional subpixel layout can leave scrollLeft a
      // hair short of the true max even when fully scrolled.
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
    }

    update();
    el.addEventListener("scroll", update, { passive: true });
    // Catches a resize/orientation change or the tab bar's own content
    // changing width, neither of which fires a scroll event on its own.
    const observer = new ResizeObserver(update);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  return { ref, atStart, atEnd };
}
