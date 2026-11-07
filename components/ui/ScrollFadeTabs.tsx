"use client";

import type { ReactNode } from "react";
import { useScrollEdges } from "@/lib/hooks/useScrollEdges";

/**
 * A horizontally-scrollable `role="tablist"` row with a fade at whichever
 * edge still has more tabs past it -- used by the Study reader's 5-tab bar
 * and the Devotional reader's 4-tab bar, both of which can overflow at
 * mobile widths with nothing on screen hinting there's more to scroll to
 * (reported live against the Study reader; the Devotional reader has the
 * identical markup and the identical gap). Fades to `parchment` since every
 * page these tab bars appear on shares that one body background
 * (app/layout.tsx) -- not meant for use against a different background.
 */
export function ScrollFadeTabs({ ariaLabel, children }: { ariaLabel: string; children: ReactNode }) {
  const { ref, atStart, atEnd } = useScrollEdges<HTMLDivElement>();

  return (
    <div className="relative">
      <div
        ref={ref}
        role="tablist"
        aria-label={ariaLabel}
        className="no-scrollbar flex gap-1 overflow-x-auto border-b border-dusk/10 pb-px"
        style={{ scrollbarWidth: "none" }}
      >
        {children}
      </div>
      {/* A plain color fade alone all but disappears against `parchment`,
          which is itself near-white -- a small chevron riding on top of it
          is what actually reads as "more tabs this way" at a glance, rather
          than something only visible on close inspection. */}
      {!atStart && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-10 flex items-center justify-start pb-px bg-gradient-to-r from-parchment via-parchment/90 to-transparent"
        >
          <span className="text-moss/70 font-sans text-sm">‹</span>
        </div>
      )}
      {!atEnd && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-10 flex items-center justify-end pb-px bg-gradient-to-l from-parchment via-parchment/90 to-transparent"
        >
          <span className="text-moss/70 font-sans text-sm">›</span>
        </div>
      )}
    </div>
  );
}
