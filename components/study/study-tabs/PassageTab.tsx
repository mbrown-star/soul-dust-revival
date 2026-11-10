"use client";

import type { StudyWeekContent } from "@/lib/study/studyContent";
import { ReadAloudButton } from "@/components/devotional/ReadAloudButton";
import { HideWordsSlider } from "@/components/devotional/HideWordsSlider";
import { WeekMediaSlot } from "../WeekMediaSlot";

/**
 * The full WEB passage for the week, verse by verse. Where a station's Greek
 * word study has a matching English anchor word in this passage (see
 * lib/study/studyContent.ts's StudyStation.anchor, computed at backfill time
 * the same way soul-dust-interactive's build_study.py does), that word is
 * underlined and opens the Greek study in a bottom sheet rather than making
 * the reader hunt for it in Work the Word first. A station with no anchor,
 * or whose anchor word isn't actually found in its own verse's text
 * (soul-dust-interactive's own HANDOFF.md documents this as a real ~1-in-5
 * gap, not just a hypothetical one), falls back to its own button below the
 * passage instead of becoming unreachable from this tab.
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

  const matchedStationRefs = new Set<string>();
  const passageSpans = content.passage.map((v, i) => {
    const key = `${v.c}:${v.n}`;
    const anchor = anchorByVerse.get(key);
    let match: { stationRef: string; word: string; idx: number } | null = null;
    if (anchor) {
      const idx = v.text.toLowerCase().indexOf(anchor.word.toLowerCase());
      if (idx !== -1) {
        match = { ...anchor, idx };
        matchedStationRefs.add(anchor.stationRef);
      }
    }
    const showChapter = i === 0 || v.c !== content.passage[i - 1]!.c;
    return { v, showChapter, match };
  });

  const unmatchedStations = content.stations.filter((st) => !matchedStationRefs.has(st.ref));
  const readAloudText = content.passage.map((v) => v.text).join(" ");

  return (
    <div className="space-y-6">
      <div>
        <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700">{content.passageRef}</p>
        <p className="font-sans text-xs text-moss mt-1">World English Bible. Tap an underlined word to open the Greek.</p>
      </div>

      <div className="prose max-w-none font-serif text-lg leading-relaxed">
        <p>
          {passageSpans.map(({ v, showChapter, match }, i) => (
            <span key={i}>
              {showChapter && <sup className="font-sans font-semibold text-moss mr-0.5">{v.c}:</sup>}
              <sup className="font-sans text-moss mr-0.5">{v.n}</sup>
              {match ? <VerseTextWithAnchor text={v.text} match={match} onOpenGreek={onOpenGreek} /> : v.text}{" "}
            </span>
          ))}
        </p>
      </div>

      {unmatchedStations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {unmatchedStations.map((st) => (
            <button
              key={st.ref}
              type="button"
              onClick={() => onOpenGreek(st.ref)}
              className="min-h-[44px] px-4 rounded-full border border-dusk/20 text-sm font-sans font-semibold text-ink hover:border-moss/50"
            >
              {st.greek} · {st.ref}
            </button>
          ))}
        </div>
      )}

      <ReadAloudButton text={readAloudText} />

      <div className="pt-4 border-t border-dusk/10">
        <h2 className="font-display font-bold text-xl text-ink">Hide It in Your Heart</h2>
        <p className="font-sans text-sm text-moss mt-1">
          {content.keyRef}, this week&apos;s key verse. Slide to hide words; tap a blank to peek.
        </p>
        <HideWordsSlider verse={content.keyVerse} />
      </div>

      <WeekMediaSlot slot="tab:passage" />

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

function VerseTextWithAnchor({
  text,
  match,
  onOpenGreek,
}: {
  text: string;
  match: { stationRef: string; word: string; idx: number };
  onOpenGreek: (stationRef: string) => void;
}) {
  const before = text.slice(0, match.idx);
  const matchedText = text.slice(match.idx, match.idx + match.word.length);
  const after = text.slice(match.idx + match.word.length);

  return (
    <>
      {before}
      <button
        type="button"
        onClick={() => onOpenGreek(match.stationRef)}
        className="underline decoration-ember decoration-2 underline-offset-2 text-ink font-semibold"
      >
        {matchedText}
      </button>
      {after}
    </>
  );
}
