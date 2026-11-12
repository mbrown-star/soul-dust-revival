// Structured content for one week of a 12-week interactive Study lesson
// (study.kind === "study"), modeled on soul-dust-interactive's weeks.json
// schema (see soul-dust-interactive/HANDOFF.md section 2). Populated at
// import/backfill time, not derived at render time -- unlike the devotional
// reader (lib/devotional/parseDevotionalHtml.ts), which splits already-
// stored HTML on every render, this is real structured data because a
// week's parts/stations/practices/prayer don't reduce to a flat paragraph
// list the way a devotional day's reading does.
//
// A lesson without this (the "Introduction" lesson, or any study lesson
// imported before this existed) falls back to the plain content-block
// reading view -- see the branch in app/(study-app)/studies/[slug]/[lessonId]/page.tsx.
export type StudyWeekContent = {
  subtitle: string;
  keyVerse: string;
  keyRef: string;
  study: {
    sections: { heading: string; paras: string[]; pulls?: string[]; media?: WeekMedia[] }[];
    parts: { label: string; heading: string; paras: string[]; pulls?: string[]; media?: WeekMedia[] }[];
  };
  passageRef: string;
  // Verse-by-verse WEB text for the week's whole passage range, embedded at
  // backfill time rather than fetched live -- see scripts/backfill-colossians-study-content.ts.
  passage: { c: number; n: number; text: string }[];
  stationsLabel: string;
  stationsIntro: string;
  stations: StudyStation[];
  lifeTitle: string;
  lifeIntro: string;
  practices: { n: number; title: string; body: string; media?: WeekMedia[] }[];
  // The prayer's lead-in sentence, its three Father/Son/Spirit beats, and
  // its closing sentence -- pre-split at backfill time (see PRAYER regex in
  // soul-dust-interactive/tools/study/build_study.py) rather than
  // re-parsed in the browser.
  prayerLead: string;
  prayerBeats: { person: "Father" | "Son" | "Spirit"; verb: string; words: string }[];
  prayerClose: string;
  // The prayer as printed, line by line, for a week whose prayer isn't the
  // timed Father/Son/Spirit form above (every study but Colossians). The
  // reader shows these when prayerBeats is empty.
  prayerLines?: string[];
  // Pull-quotes printed in the Life Application section.
  lifePulls?: string[];
  bottomLine: string[];
  benediction: string[];
  closingVerse: string;
  closingRef: string;
  carry: string;
  // Free-form media at the end of each reader tab (before its "done"
  // button), for anything that doesn't belong to one section/part/station.
  tabMedia?: Partial<Record<WeekTabId, WeekMedia[]>>;
};

export type WeekTabId = "study" | "passage" | "work" | "live" | "lift";

/**
 * An image, video, audio, or callout placed inside a week -- after a
 * section's, part's, station's, or practice's own text, or at the end of a
 * tab. Same fields as the matching content block type (lib/content/blocks.ts),
 * so the builder reuses the block editors; `id` is a builder-assigned uuid.
 * An uploaded video/audio (`mediaId`) is played through the same signed
 * Stream URL as a content block, keyed by lesson + mediaId.
 */
export type WeekMedia = {
  id: string;
  type: "image" | "video" | "audio" | "callout";
  imageUrl?: string | null;
  imageAlt?: string | null;
  mediaId?: string | null;
  mediaUrl?: string | null;
  captionsUrl?: string | null;
  transcript?: string | null;
  calloutTitle?: string | null;
  calloutColor?: string | null;
  body?: string | null;
};

export type StudyStation = {
  ref: string;
  // Which language the word study opens (GOING DEEPER · THE GREEK / THE
  // HEBREW). Absent on weeks loaded before this existed, which were all Greek.
  lang?: "greek" | "hebrew";
  verse: string;
  question: string;
  // Real content_blocks row (type "question") created at backfill time, so
  // the station's answer reuses the existing QuestionBlock/responses
  // save-per-user plumbing unchanged rather than a parallel mechanism.
  questionBlockId: string;
  // The original-language word (Greek or Hebrew, despite the name). Empty
  // when the manuscript prints only the transliteration.
  greek: string;
  translit: string;
  gloss: string;
  xref: string;
  body: string[];
  live: string;
  verseNums: string[];
  anchor: { v: string; word: string } | null;
  // Pull-quotes printed after this station.
  pulls?: string[];
  media?: WeekMedia[];
};

/** "The Greek" or "The Hebrew", as the manuscript labels the station's word study. */
export function wordStudyLanguage(station: Pick<StudyStation, "lang">): "Greek" | "Hebrew" {
  return station.lang === "hebrew" ? "Hebrew" : "Greek";
}

/**
 * The word a station's study turns on: the original-language word, or, where
 * the manuscript prints only the transliteration (some Hebrew studies), that.
 */
export function wordStudyHeadword(station: Pick<StudyStation, "greek" | "translit">): string {
  return station.greek || station.translit;
}
