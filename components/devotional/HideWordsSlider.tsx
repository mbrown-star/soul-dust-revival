"use client";

import { useId, useMemo, useState } from "react";

/**
 * A memorization aid for the day's key verse: dragging the slider blanks out
 * a growing fraction of the words (evenly spaced through the verse, not just
 * the end of it) so a reader can practice reciting it from memory.
 */
export function HideWordsSlider({ verse }: { verse: string }) {
  const [hiddenPct, setHiddenPct] = useState(0);
  const sliderId = useId();

  const words = useMemo(() => verse.split(/(\s+)/), [verse]);
  const wordIndexes = useMemo(() => words.map((w, i) => (w.trim() ? i : -1)).filter((i) => i !== -1), [words]);

  const displayed = useMemo(() => {
    if (hiddenPct === 0) return verse;
    const hideCount = Math.round((hiddenPct / 100) * wordIndexes.length);
    if (hideCount === 0) return verse;

    // Spread the hidden words evenly through the verse rather than always
    // blanking from one end, so partial hiding still reads like practice,
    // not just "the first half is gone."
    const step = wordIndexes.length / hideCount;
    const hideSet = new Set<number>();
    for (let n = 0; n < hideCount; n++) {
      hideSet.add(wordIndexes[Math.floor(n * step)]!);
    }

    return words
      .map((w, i) => (hideSet.has(i) ? "_".repeat(Math.max(2, w.length)) : w))
      .join("");
  }, [words, wordIndexes, hiddenPct, verse]);

  return (
    <div className="mt-4">
      <p className="font-serif italic text-lg text-ink leading-relaxed" aria-live="polite">
        {displayed}
      </p>
      <div className="flex items-center gap-3 mt-3">
        <label htmlFor={sliderId} className="text-xs font-sans text-moss whitespace-nowrap">
          Hide words
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={100}
          value={hiddenPct}
          onChange={(e) => setHiddenPct(Number(e.target.value))}
          className="w-full accent-ink"
          aria-label="Hide a portion of the verse's words, for memorization practice"
        />
      </div>
    </div>
  );
}
