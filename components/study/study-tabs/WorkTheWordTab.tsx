"use client";

import { useState } from "react";
import { type StudyWeekContent, type WordStudy, hasWordStudy, wordStudyHeadword, wordStudyLanguage } from "@/lib/study/studyContent";
import { QuestionBlock } from "../QuestionBlock";
import { WeekMediaSlot } from "../WeekMediaSlot";

/**
 * The five verse stations, one at a time (a numbered stepper, not a stacked
 * list) -- matching soul-dust-interactive's own study_template.html, which
 * shows a single station with Previous/Next navigation rather than all five
 * at once. Each station's answer reuses the existing QuestionBlock/responses
 * plumbing (see scripts/backfill-colossians-study-content.ts) -- so this
 * tab's "answer then open the Greek" order is a UI convention here, not
 * enforced, since gating it for real would mean changing QuestionBlock's
 * public save contract just for this one caller. Once every station has a
 * non-empty saved answer and its Greek word study opened, this tab marks
 * itself done automatically (there's no manual "finished" button here, same
 * as the reference template).
 */
export function WorkTheWordTab({
  content,
  initialAnswers,
  current,
  onCurrentChange,
  onAllStationsDone,
  onAdvanceToLive,
}: {
  content: StudyWeekContent;
  initialAnswers: Record<string, string>;
  current: number;
  onCurrentChange: (index: number) => void;
  onAllStationsDone: () => void;
  onAdvanceToLive: () => void;
}) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [answered, setAnswered] = useState<Set<string>>(
    () => new Set(content.stations.filter((st) => (initialAnswers[st.questionBlockId] ?? "").trim()).map((st) => st.questionBlockId))
  );

  const station = content.stations[current];
  // A week built in the admin can be saved before it has any stations.
  if (!station) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-display font-bold text-xl text-ink">{content.stationsLabel}</h2>
          {content.stationsIntro && <p className="font-serif text-ink mt-2">{content.stationsIntro}</p>}
        </div>
        <WeekMediaSlot slot="tab:work" />
        <button
          type="button"
          onClick={onAdvanceToLive}
          className="min-h-[44px] px-4 rounded-full bg-ink text-parchment text-sm font-sans font-semibold"
        >
          Go to Live It →
        </button>
      </div>
    );
  }
  const stationRef = station.ref;
  const isGreekOpen = revealed.has(stationRef);

  function checkAllDone(nextRevealed: Set<string>, nextAnswered: Set<string>) {
    const allDone = content.stations.every(
      (st) => (!hasWordStudy(st) || nextRevealed.has(st.ref)) && nextAnswered.has(st.questionBlockId)
    );
    if (allDone) onAllStationsDone();
  }

  function handleAnswered(questionBlockId: string, text: string) {
    setAnswered((prev) => {
      const next = new Set(prev);
      if (text.trim()) next.add(questionBlockId);
      else next.delete(questionBlockId);
      checkAllDone(revealed, next);
      return next;
    });
  }

  function revealGreek() {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.add(stationRef);
      checkAllDone(next, answered);
      return next;
    });
  }

  const isLast = current === content.stations.length - 1;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-xl text-ink">{content.stationsLabel}</h2>
        <p className="font-serif text-ink mt-2">{content.stationsIntro} Answer first; the word study opens after.</p>
      </div>

      <div className="flex gap-1.5" role="tablist" aria-label="Stations">
        {content.stations.map((st, i) => {
          const isOk = (!hasWordStudy(st) || revealed.has(st.ref)) && answered.has(st.questionBlockId);
          return (
            <button
              key={st.ref}
              type="button"
              role="tab"
              aria-current={i === current}
              aria-label={`Station ${i + 1}`}
              onClick={() => onCurrentChange(i)}
              className={`flex-1 h-9 rounded-lg border text-sm font-sans font-bold tabular-nums ${
                isOk
                  ? "bg-moss border-moss text-white"
                  : i === current
                    ? "border-ember text-ink"
                    : "border-dusk/20 text-moss"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      <div id={`station-${station.ref}`} className="space-y-4 scroll-mt-4">
        <div>
          <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700">{station.ref}</p>
          <blockquote className="font-serif italic text-lg text-ink mt-1">{station.verse}</blockquote>
        </div>

        {station.note?.map((p, i) => (
          <p key={i} className="font-serif text-ink">
            {p}
          </p>
        ))}

        <QuestionBlock
          key={station.ref}
          contentBlockId={station.questionBlockId}
          prompt={station.question}
          initialAnswer={initialAnswers[station.questionBlockId]}
          onSaved={(text) => handleAnswered(station.questionBlockId, text)}
        />

        {hasWordStudy(station) &&
          (isGreekOpen ? (
            [station, ...(station.moreStudies ?? [])].map((study, i) => <WordStudyPanel key={i} study={study} />)
          ) : (
            <button
              type="button"
              onClick={revealGreek}
              className="w-full min-h-[44px] rounded-xl border-2 border-dashed border-ember-700 text-ember-700 font-sans font-semibold text-sm"
            >
              Open the {wordStudyLanguage(station)} · {wordStudyHeadword(station)}
            </button>
          ))}

        {station.pulls?.map((pull, i) => (
          <blockquote key={i} className="border-l-4 border-ember bg-dusk/5 rounded-r-xl p-5 font-serif italic text-lg text-ink">
            {pull}
          </blockquote>
        ))}
      </div>

      <WeekMediaSlot slot={`station:${current}`} />

      <div className="flex justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={() => onCurrentChange(current - 1)}
          disabled={current === 0}
          className="min-h-[44px] px-4 rounded-full border border-moss/30 text-sm font-sans font-semibold text-ink disabled:opacity-40"
        >
          ← Previous
        </button>
        <button
          type="button"
          onClick={() => (isLast ? onAdvanceToLive() : onCurrentChange(current + 1))}
          className="min-h-[44px] px-4 rounded-full bg-ink text-parchment text-sm font-sans font-semibold"
        >
          {isLast ? "Go to Live It →" : "Next →"}
        </button>
      </div>

      <WeekMediaSlot slot="tab:work" />
    </div>
  );
}

/** GOING DEEPER · THE GREEK (or HEBREW): one word study, opened. */
function WordStudyPanel({ study }: { study: WordStudy }) {
  return (
    <div className="bg-dusk/5 rounded-lg p-4 space-y-2">
      {/* FIXED (axe-core, qa/e2e/specs/accessibility.spec.ts): same
          bg-dusk/5-vs-ember-700 contrast gap as LiveItTab's "Bottom
          Line" label (4.47:1, under WCAG AA's 4.5:1) -- moss clears it. */}
      <p className="font-sans text-xs font-semibold uppercase tracking-wide text-moss">
        Going Deeper · The {wordStudyLanguage(study)}
      </p>
      <p className="font-serif text-xl text-ink">
        {study.greek ? (
          <>
            {study.greek} <span className="text-moss text-base">({study.translit})</span>
          </>
        ) : (
          <span className="italic">{study.translit}</span>
        )}
      </p>
      {study.gloss && <p className="font-serif text-ink">{study.gloss}</p>}
      {study.body.map((p, i) => (
        <p key={i} className="font-serif text-ink">
          {p}
        </p>
      ))}
      {study.xref && <p className="font-sans text-xs text-moss">{study.xref}</p>}
      {study.live && (
        <div className="bg-ink text-parchment rounded-lg p-3 mt-2">
          <p className="font-sans text-xs font-semibold uppercase tracking-wide text-gold mb-1">Live It</p>
          <p className="font-serif">{study.live}</p>
        </div>
      )}
    </div>
  );
}
