"use client";

import { type StudyWeekContent, hasWordStudy, wordStudyHeadword } from "@/lib/study/studyContent";
import { ReadAloudButton } from "@/components/devotional/ReadAloudButton";
import { HideWordsSlider } from "@/components/devotional/HideWordsSlider";
import { displayVerseRef } from "@/lib/study/verseRef";
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
  onOpenGreek: (stationId: string) => void;
  isDone: boolean;
  onSetDone: (done: boolean) => void;
}) {
  // An anchor in a gathered passage names its part too, since "3:5" can be
  // printed twice (John 3:5 and Titus 3:5).
  const anchorByVerse = new Map<string, { stationId: string; word: string; headword: string }>();
  for (const st of content.stations) {
    if (st.anchor) {
      const key = st.anchor.part ? `${st.anchor.part}|${st.anchor.v}` : st.anchor.v;
      anchorByVerse.set(key, { stationId: st.questionBlockId, word: st.anchor.word, headword: wordStudyHeadword(st) });
    }
  }

  const matchedStationIds = new Set<string>();
  type Span = { v: StudyWeekContent["passage"][number]; showChapter: boolean; match: AnchorMatch | null; startsPart: boolean };
  const passageSpans: Span[] = [];
  let part: string | undefined;
  for (const [i, v] of content.passage.entries()) {
    const startsPart = Boolean(v.ref);
    part = v.ref ?? part;
    const verseKey = `${v.c}:${v.n}`;
    const anchor = (part && anchorByVerse.get(`${part}|${verseKey}`)) || anchorByVerse.get(verseKey);
    let match: AnchorMatch | null = null;
    if (anchor && !matchedStationIds.has(anchor.stationId)) {
      const idx = v.text.toLowerCase().indexOf(anchor.word.toLowerCase());
      if (idx !== -1) {
        match = { ...anchor, idx };
        matchedStationIds.add(anchor.stationId);
      }
    }
    const showChapter = i === 0 || startsPart || v.c !== content.passage[i - 1]!.c;
    passageSpans.push({ v, showChapter, match, startsPart });
  }
  // Consecutive verses form one paragraph; a gathered passage starts a new
  // paragraph, under its own heading, at each part.
  const paragraphs: { heading?: string; spans: typeof passageSpans }[] = [];
  for (const span of passageSpans) {
    if (span.startsPart || paragraphs.length === 0) paragraphs.push({ heading: span.v.ref, spans: [] });
    paragraphs[paragraphs.length - 1]!.spans.push(span);
  }

  const unmatchedStations = content.stations.filter((st) => hasWordStudy(st) && !matchedStationIds.has(st.questionBlockId));
  const readAloudText = content.passage.map((v) => v.text).join(" ");

  return (
    <div className="space-y-6">
      <div>
        <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700">{content.passageRef}</p>
        <p className="font-sans text-xs text-moss mt-1">World English Bible. Tap an underlined word to open its word study.</p>
      </div>

      <div className="prose max-w-none font-serif text-lg leading-relaxed">
        {paragraphs.map((para, p) => (
          <div key={p}>
            {para.heading && (
              <h3 className="not-prose font-sans text-xs font-semibold uppercase tracking-wide text-ember-700 mt-6 mb-1">
                {para.heading}
              </h3>
            )}
            <p className={para.heading ? "mt-0" : undefined}>
              {para.spans.map(({ v, showChapter, match }, i) => (
                <span key={i}>
                  {showChapter && <sup className="font-sans font-semibold text-moss mr-0.5">{v.c}:</sup>}
                  <sup className="font-sans text-moss mr-0.5">{v.n}</sup>
                  {match ? <VerseTextWithAnchor text={v.text} match={match} onOpenGreek={onOpenGreek} /> : v.text}{" "}
                </span>
              ))}
            </p>
          </div>
        ))}
      </div>

      {unmatchedStations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {unmatchedStations.map((st) => (
            <button
              key={st.questionBlockId}
              type="button"
              onClick={() => onOpenGreek(st.questionBlockId)}
              className="min-h-[44px] px-4 rounded-full border border-dusk/20 text-sm font-sans font-semibold text-ink hover:border-moss/50"
            >
              {wordStudyHeadword(st)} · {st.ref}
            </button>
          ))}
        </div>
      )}

      <ReadAloudButton text={readAloudText} />

      <div className="pt-4 border-t border-dusk/10">
        <h2 className="font-display font-bold text-xl text-ink">Hide It in Your Heart</h2>
        <p className="font-sans text-sm text-moss mt-1">
          {displayVerseRef(content.keyRef)}, this week&apos;s key verse. Slide to hide words; tap a blank to peek.
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

type AnchorMatch = { stationId: string; word: string; headword: string; idx: number };

function VerseTextWithAnchor({
  text,
  match,
  onOpenGreek,
}: {
  text: string;
  match: AnchorMatch;
  onOpenGreek: (stationId: string) => void;
}) {
  const before = text.slice(0, match.idx);
  const matchedText = text.slice(match.idx, match.idx + match.word.length);
  const after = text.slice(match.idx + match.word.length);

  return (
    <>
      {before}
      <button
        type="button"
        onClick={() => onOpenGreek(match.stationId)}
        aria-label={`Word study: ${matchedText.toLowerCase()} (${match.headword})`}
        className="underline decoration-ember decoration-2 underline-offset-2 text-ink font-semibold"
      >
        {matchedText}
      </button>
      {after}
    </>
  );
}
