"use client";

import { useState } from "react";
import type { StudyWeekContent } from "@/lib/study/studyContent";
import { HideWordsSlider } from "@/components/devotional/HideWordsSlider";
import { ReadAloudButton } from "@/components/devotional/ReadAloudButton";
import { useLocalProgress } from "../useLocalProgress";

/**
 * The week opener: key verse, the two SCRIPTURE STUDY · DIVE sections shown
 * in full, then the four Parts opened one at a time (an accordion, not a
 * flat scroll) and marked read the moment they're opened -- per the book's
 * own intended reading order (soul-dust-interactive/HANDOFF.md's Study tab
 * row, and its study_template.html, which marks a part's <details> read on
 * its "toggle" event rather than via a separate click).
 */
export function StudyTab({
  lessonId,
  content,
  isDone,
  onSetDone,
}: {
  lessonId: string;
  content: StudyWeekContent;
  isDone: boolean;
  onSetDone: (done: boolean) => void;
}) {
  const [readParts, togglePart] = useLocalProgress(`sdr-study-parts-${lessonId}`);
  const [openPart, setOpenPart] = useState<number | null>(0);

  const readAloudText = [content.keyVerse, ...content.study.sections.flatMap((s) => [s.heading, ...s.paras])].join(" ");

  function openPartAndMarkRead(i: number) {
    const next = openPart === i ? null : i;
    setOpenPart(next);
    if (next !== null && !readParts.has(next)) togglePart(next);
  }

  return (
    <div className="space-y-8">
      <div className="bg-white border border-dusk/10 rounded-xl p-6">
        <HideWordsSlider verse={content.keyVerse} />
        <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700 mt-3">{content.keyRef}</p>
        <p className="font-serif italic text-sm text-moss mt-3">
          &ldquo;My soul clings to the dust; Revive me according to Your word.&rdquo; Psalm 119:25 (NKJV)
        </p>
        <p className="font-sans text-xs font-bold tracking-[0.2em] text-moss text-center mt-4">READ · REFLECT · RETURN</p>
      </div>

      <ReadAloudButton text={readAloudText} />

      <p className="font-sans text-xs font-bold uppercase tracking-wide text-moss">Scripture Study · Dive</p>

      {content.study.sections.map((section, i) => (
        <div key={i} className="space-y-3">
          <h2 className="font-display font-bold text-xl text-ink">{section.heading}</h2>
          {section.pulls?.map((pull, j) => (
            <blockquote key={j} className="border-l-4 border-ember bg-dusk/5 rounded-r-xl p-5 font-serif italic text-lg text-ink">
              {pull}
            </blockquote>
          ))}
          <div className="prose max-w-none font-serif">
            {section.paras.map((p, j) => (
              <p key={j}>{p}</p>
            ))}
          </div>
        </div>
      ))}

      <div className="space-y-3">
        <p className="font-sans text-xs font-semibold uppercase tracking-wide text-moss">Four Parts</p>
        {content.study.parts.map((part, i) => {
          const isOpen = openPart === i;
          const isRead = readParts.has(i);
          return (
            <div key={i} className="border border-dusk/10 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => openPartAndMarkRead(i)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-3 p-4 text-left min-h-[44px]"
              >
                <span>
                  <span className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700 block">
                    {part.label}
                  </span>
                  <span className="font-display font-bold text-ink">{part.heading}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-xs ${
                    isRead ? "bg-moss border-moss text-white" : "border-dusk/30 text-transparent"
                  }`}
                >
                  ✓
                </span>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-3">
                  {part.pulls?.map((pull, j) => (
                    <blockquote key={j} className="border-l-4 border-ember bg-dusk/5 rounded-r-xl p-5 font-serif italic text-lg text-ink">
                      {pull}
                    </blockquote>
                  ))}
                  <div className="prose max-w-none font-serif">
                    {part.paras.map((p, j) => (
                      <p key={j}>{p}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <p className="font-sans text-xs text-moss">
          {readParts.size} of {content.study.parts.length} parts read
        </p>
      </div>

      <button
        type="button"
        onClick={() => onSetDone(!isDone)}
        className={`w-full min-h-[44px] rounded-full font-sans font-semibold text-sm ${
          isDone ? "bg-moss text-white" : "bg-ink text-parchment"
        }`}
      >
        {isDone ? "✓ Finished the study" : "Finished the study"}
      </button>
    </div>
  );
}
