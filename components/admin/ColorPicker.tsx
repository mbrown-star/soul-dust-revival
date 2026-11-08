"use client";

import { useId } from "react";
import { contrastRatio, WCAG_AA_NORMAL_TEXT } from "@/lib/color/contrast";

// The two text colors that actually render on top of a callout's chosen
// background in LessonBlock.tsx: the title inherits `ink` from
// app/layout.tsx's <body>, while the body copy sits inside a `.prose` div
// that @tailwindcss/typography gives its own color (slate-700, its
// unmodified default) rather than inheriting `ink` -- so a contrast check
// against only one of these could pass while the other actually fails.
const CALLOUT_TITLE_TEXT_COLOR = "#1a120c"; // ink
const CALLOUT_BODY_TEXT_COLOR = "#334155"; // Tailwind slate-700 (@tailwindcss/typography's default prose body color)

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const swatchId = useId();
  const hexId = useId();
  const background = value || "#fef3c7";

  const titleRatio = contrastRatio(background, CALLOUT_TITLE_TEXT_COLOR);
  const bodyRatio = contrastRatio(background, CALLOUT_BODY_TEXT_COLOR);
  const worstRatio = titleRatio !== null && bodyRatio !== null ? Math.min(titleRatio, bodyRatio) : null;
  const failsAA = worstRatio !== null && worstRatio < WCAG_AA_NORMAL_TEXT;

  return (
    <div>
      <div className="flex items-center gap-2">
        <label htmlFor={swatchId} className="sr-only">Background color swatch</label>
        <input
          id={swatchId}
          type="color"
          value={background}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 border rounded cursor-pointer focus:outline-none focus:ring-2 focus:ring-ink"
        />
        <label htmlFor={hexId} className="sr-only">Background color hex value</label>
        <input
          id={hexId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#fef3c7"
          className="border rounded-lg p-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-ink"
        />
      </div>
      {worstRatio !== null && (
        <p
          role={failsAA ? "alert" : undefined}
          className={`text-xs mt-1 ${failsAA ? "text-error font-semibold" : "text-moss"}`}
        >
          {failsAA
            ? `Low contrast (${worstRatio.toFixed(1)}:1) — this block's text needs at least ${WCAG_AA_NORMAL_TEXT}:1 against its background (WCAG AA).`
            : `Contrast OK: ${worstRatio.toFixed(1)}:1 against this block's text (WCAG AA needs ${WCAG_AA_NORMAL_TEXT}:1).`}
        </p>
      )}
    </div>
  );
}
