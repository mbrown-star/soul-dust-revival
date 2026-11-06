"use client";

import { useState } from "react";
import type { StudyWeekContent } from "@/lib/study/studyContent";
import { QuestionBlock } from "../QuestionBlock";

/**
 * The five verse stations, one QUESTION-then-Greek unit each. Each station's
 * answer reuses the existing QuestionBlock/responses plumbing (see
 * scripts/backfill-colossians-study-content.ts) -- so this tab's "answer
 * then open the Greek" order is a UI convention here, not enforced, since
 * gating it for real would mean changing QuestionBlock's public save
 * contract just for this one caller.
 */
export function WorkTheWordTab({
  content,
  initialAnswers,
}: {
  content: StudyWeekContent;
  initialAnswers: Record<string, string>;
}) {
  const [openGreek, setOpenGreek] = useState<Set<string>>(new Set());

  function toggleGreek(ref: string) {
    setOpenGreek((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-xl text-ink">{content.stationsLabel}</h2>
        <p className="font-serif text-ink mt-2">{content.stationsIntro}</p>
      </div>

      {content.stations.map((st) => {
        const isGreekOpen = openGreek.has(st.ref);
        return (
          <div
            key={st.ref}
            id={`station-${st.ref}`}
            className="border border-dusk/10 rounded-xl p-5 space-y-4 scroll-mt-4"
          >
            <div>
              <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700">{st.ref}</p>
              <blockquote className="font-serif italic text-lg text-ink mt-1">{st.verse}</blockquote>
            </div>

            <QuestionBlock
              contentBlockId={st.questionBlockId}
              prompt={st.question}
              initialAnswer={initialAnswers[st.questionBlockId]}
            />

            <button
              type="button"
              onClick={() => toggleGreek(st.ref)}
              aria-expanded={isGreekOpen}
              className="text-sm font-sans font-semibold text-moss underline min-h-[44px]"
            >
              {isGreekOpen ? "Hide the Greek ▴" : "Open the Greek ▾"}
            </button>

            {isGreekOpen && (
              <div className="bg-dusk/5 rounded-lg p-4 space-y-2">
                <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700">
                  Going Deeper · The Greek
                </p>
                <p className="font-serif text-xl text-ink">
                  {st.greek} <span className="text-moss text-base">({st.translit})</span>
                </p>
                <p className="font-serif text-ink">{st.gloss}</p>
                {st.body.map((p, i) => (
                  <p key={i} className="font-serif text-ink">
                    {p}
                  </p>
                ))}
                <p className="font-sans text-xs text-moss">{st.xref}</p>
                <div className="bg-ink text-parchment rounded-lg p-3 mt-2">
                  <p className="font-sans text-xs font-semibold uppercase tracking-wide text-gold mb-1">Live It</p>
                  <p className="font-serif">{st.live}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
