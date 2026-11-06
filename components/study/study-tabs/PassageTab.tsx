"use client";

import type { StudyWeekContent } from "@/lib/study/studyContent";
import { ReadAloudButton } from "@/components/devotional/ReadAloudButton";

/**
 * The full WEB passage for the week, verse by verse. Where a station's Greek
 * word study has a matching English anchor word in this passage (see
 * lib/study/studyContent.ts's StudyStation.anchor, computed at backfill time
 * the same way soul-dust-interactive's build_study.py does), that word is
 * underlined and opens the Greek study in a bottom sheet rather than making
 * the reader hunt for it in Work the Word first.
 */
export function PassageTab({
  content,
  onOpenGreek,
  isDone,
  onSetDone,
}: {
  content: StudyWeekContent;
  onOpenGreek: (stationRef: string) => void;
  isDone: boolean;
  onSetDone: (done: boolean) => void;
}) {
  const anchorByVerse = new Map<string, { stationRef: string; word: string }>();
  for (const st of content.stations) {
    if (st.anchor) anchorByVerse.set(st.anchor.v, { stationRef: st.ref, word: st.anchor.word });
  }

  const readAloudText = content.passage.map((v) => v.text).join(" ");

  return (
    <div className="space-y-6">
      <div>
        <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700">{content.passageRef}</p>
        <p className="font-sans text-xs text-moss mt-1">World English Bible</p>
      </div>

      <ReadAloudButton text={readAloudText} />

      <div className="prose max-w-none font-serif text-lg leading-relaxed">
        <p>
          {content.passage.map((v, i) => {
            const key = `${v.c}:${v.n}`;
            const anchor = anchorByVerse.get(key);
            const showChapter = i === 0 || v.c !== content.passage[i - 1]!.c;
            return (
              <span key={i}>
                {showChapter && (
                  <sup className="font-sans font-semibold text-moss mr-0.5">{v.c}:</sup>
                )}
                <sup className="font-sans text-moss mr-0.5">{v.n}</sup>
                <VerseText text={v.text} anchor={anchor} onOpenGreek={onOpenGreek} />{" "}
              </span>
            );
          })}
        </p>
      </div>

      <button
        type="button"
        onClick={() => onSetDone(!isDone)}
        className={`w-full min-h-[44px] rounded-full font-sans font-semibold text-sm ${
          isDone ? "bg-moss text-white" : "bg-ink text-parchment"
        }`}
      >
        {isDone ? "✓ Read and memorized" : "Read and memorized"}
      </button>
    </div>
  );
}

function VerseText({
  text,
  anchor,
  onOpenGreek,
}: {
  text: string;
  anchor: { stationRef: string; word: string } | undefined;
  onOpenGreek: (stationRef: string) => void;
}) {
  if (!anchor) return <>{text}</>;

  const idx = text.toLowerCase().indexOf(anchor.word.toLowerCase());
  if (idx === -1) return <>{text}</>;

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + anchor.word.length);
  const after = text.slice(idx + anchor.word.length);

  return (
    <>
      {before}
      <button
        type="button"
        onClick={() => onOpenGreek(anchor.stationRef)}
        className="underline decoration-ember decoration-2 underline-offset-2 text-ink font-semibold"
      >
        {match}
      </button>
      {after}
    </>
  );
}
