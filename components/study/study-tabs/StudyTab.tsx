"use client";

import { useState } from "react";
import type { StudyWeekContent } from "@/lib/study/studyContent";
import { HideWordsSlider } from "@/components/devotional/HideWordsSlider";
import { ReadAloudButton } from "@/components/devotional/ReadAloudButton";
import { useLocalProgress } from "../useLocalProgress";

/**
 * The week opener: key verse, the two SCRIPTURE STUDY · DIVE sections shown
 * in full, then the four Parts opened one at a time (an accordion, not a
 * flat scroll) and checked off as read -- per the book's own intended
 * reading order (soul-dust-interactive/HANDOFF.md's Study tab row).
 */
export function StudyTab({ lessonId, content }: { lessonId: string; content: StudyWeekContent }) {
  const [readParts, togglePart] = useLocalProgress(`sdr-study-parts-${lessonId}`);
  const [openPart, setOpenPart] = useState<number | null>(0);

  const readAloudText = [content.keyVerse, ...content.study.sections.flatMap((s) => [s.heading, ...s.paras])].join(" ");

  return (
    <div className="space-y-8">
      <div className="bg-white border border-dusk/10 rounded-xl p-6">
        <HideWordsSlider verse={content.keyVerse} />
        <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700 mt-3">{content.keyRef}</p>
      </div>

      <ReadAloudButton text={readAloudText} />

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
                onClick={() => setOpenPart(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-3 p-4 text-left min-h-[44px]"
              >
                <span>
                  <span className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700 block">
                    {part.label}
                  </span>
                  <span className="font-display font-bold text-ink">{part.heading}</span>
                </span>
                <span aria-hidden="true" className={isRead ? "text-moss" : "text-dusk/30"}>
                  {isRead ? "✓" : "○"}
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
                  {!isRead && (
                    <button
                      type="button"
                      onClick={() => togglePart(i)}
                      className="text-sm font-sans text-moss underline min-h-[44px]"
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
