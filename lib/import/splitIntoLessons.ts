export type ImportedLesson = {
  title: string;
  bodyHtml: string;
};

/**
 * Splits Mammoth-generated HTML (from a .docx) into lessons using the
 * document's own Heading 1 / Heading 2 styles as boundaries. This is
 * reliable because it relies on Word's actual heading structure, not guesswork.
 */
export function splitHtmlByHeadings(html: string): ImportedLesson[] {
  const headingRegex = /<h[12][^>]*>(.*?)<\/h[12]>/gi;
  const matches = [...html.matchAll(headingRegex)];

  if (matches.length === 0) {
    // No headings found — treat the whole document as a single lesson.
    return [{ title: "Imported Content", bodyHtml: html }];
  }

  const lessons: ImportedLesson[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    if (!match) continue; // unreachable given the loop bound, but keeps TS honest

    const title = stripTags(match[1] ?? "").trim() || `Section ${i + 1}`;
    const start = (match.index ?? 0) + match[0].length;
    const nextMatch = matches[i + 1];
    const end = nextMatch ? (nextMatch.index ?? html.length) : html.length;
    const bodyHtml = html.slice(start, end).trim();
    lessons.push({ title, bodyHtml });
  }

  return lessons;
}

// Common devotional/study section labels. "Day" is included alongside the
// original set specifically for day-by-day devotionals (e.g. a 365-day
// devotional), which otherwise produced zero matches and collapsed the
// entire document into one lesson.
const SECTION_LABEL = "(day|week|lesson|session|chapter|part)";
const headingPattern = new RegExp(`^${SECTION_LABEL}\\s+\\d+`, "i");

/**
 * Splits plain text (from a PDF) into lessons. PDFs don't preserve style
 * info the way Word docs do, so this has two tiers, most-reliable first:
 *
 * 1. If the document has a genuine Table of Contents, its entries (in
 *    order, with trailing dot-leaders/page numbers stripped) are the most
 *    trustworthy source of real lesson boundaries — they're the author's
 *    own list of sections, not a guess. Each entry's heading is located
 *    again later in the body (skipping the TOC's own occurrence) to find
 *    where that lesson's content actually starts.
 * 2. Failing that, a generic heading-keyword heuristic ("Day 1", "Lesson 3:
 *    Title", "Session 2", etc.) is used instead — inherently less reliable,
 *    since nothing here is guaranteed to be an actual heading rather than a
 *    body sentence that happens to start the same way.
 *
 * Either way, review after import is expected — this is a heuristic over
 * unstructured text, not a guarantee.
 */
export function splitPlainTextByHeadings(text: string): ImportedLesson[] {
  const lines = text.split("\n").map((l) => l.trim());

  const toc = extractTableOfContents(lines);
  if (toc) {
    const sections = splitByTocEntries(lines, toc);
    if (sections.length >= 2) {
      return sections.map((s) => ({ title: s.title, bodyHtml: paragraphsToHtml(s.lines) }));
    }
    // Found what looked like a TOC, but couldn't actually locate most of its
    // entries as real headings in the body (e.g. the PDF's text-extraction
    // order doesn't match reading order) — fall through to the generic
    // heuristic instead of returning a near-empty, clearly-wrong split. The
    // TOC block itself is skipped first: its dot-leader entry lines
    // ("Day 1: Title .... 5") are provably not real section headings, but
    // each still starts with a label the keyword heuristic below would
    // otherwise mistake for one, duplicating every TOC entry as its own
    // spurious one-line "lesson".
    return splitByHeadingKeywords(lines.slice(toc.headingIndex + toc.entries.length + 1));
  }

  return splitByHeadingKeywords(lines);
}

type TocEntry = { title: string; searchLabel: string };

/**
 * Looks for a "Table of Contents" / "Contents" heading near the top of the
 * document and reads the entries listed under it — each one typically a
 * title followed by a run of dots/spaces and a page number (what a PDF's
 * text extraction usually reduces a dot-leader TOC line to), or a plain
 * "Day 3: Title" line with no page number. Stops at the first line that
 * looks like neither, once at least one entry has been collected. Returns
 * null if nothing TOC-shaped was found at all, or if fewer than 2 entries
 * were collected (too little to trust as a real table of contents rather
 * than a stray heading that happened to say "Contents").
 */
function extractTableOfContents(lines: string[]): { headingIndex: number; entries: TocEntry[] } | null {
  const tocHeadingIndex = lines.findIndex((l) => /^(table of contents|contents)$/i.test(l));
  if (tocHeadingIndex === -1) return null;

  // A line ending in a dot-leader ("...... 12") or plain run of spaces then
  // a page number ("Day 1: Title      12"), or just a bare heading-shaped
  // line with no page number at all (some PDFs drop page numbers from the
  // extracted text, or the TOC never had them).
  const dotLeaderPattern = /^(.+?)(?:[.\s]{3,}|\t+)\d+\s*$/;

  const entries: TocEntry[] = [];
  for (let i = tocHeadingIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue; // blank lines are normal spacing within a TOC, not the end of one

    const dotLeaderMatch = line.match(dotLeaderPattern);
    const title = (dotLeaderMatch ? dotLeaderMatch[1] ?? line : line).trim();

    if (title && (dotLeaderMatch || headingPattern.test(title)) && title.length < 120) {
      entries.push({ title, searchLabel: extractSearchLabel(title) });
      continue;
    }

    // Once entries have started, the first line that doesn't look like
    // either shape ends the TOC (e.g. the next real section's body text).
    if (entries.length > 0) break;
  }

  return entries.length >= 2 ? { headingIndex: tocHeadingIndex, entries } : null;
}

/**
 * The part of a TOC entry's title worth searching the body for literally —
 * a body heading often repeats just "Day 3" without the TOC's fuller
 * "Day 3: Trusting the Dust" subtitle, so matching on the leading label
 * alone is more forgiving than requiring the whole title to reappear
 * verbatim. Falls back to the full title when it isn't label-shaped at all
 * (a TOC entry with no "Day/Week/..." prefix, e.g. "Introduction").
 */
function extractSearchLabel(title: string): string {
  const match = title.match(new RegExp(`^${SECTION_LABEL}\\s+\\d+`, "i"));
  return match ? match[0] : title;
}

/**
 * Finds each TOC entry's heading again in the body (searching strictly
 * after the TOC itself, and after the previous entry's own match, so
 * entries are always located in the order the table of contents lists
 * them) and splits the text there. A TOC entry whose heading can't be
 * found in the body is skipped — not every entry is guaranteed to produce
 * a usable section, since this is still matching against unstructured
 * extracted text.
 */
function splitByTocEntries(
  lines: string[],
  toc: { headingIndex: number; entries: TocEntry[] }
): { title: string; lines: string[] }[] {
  const boundaries: { title: string; lineIndex: number }[] = [];
  let searchFrom = toc.headingIndex + toc.entries.length + 1;

  for (const entry of toc.entries) {
    const foundAt = lines.findIndex(
      (line, i) => i >= searchFrom && line.toLowerCase().startsWith(entry.searchLabel.toLowerCase())
    );
    if (foundAt === -1) continue;
    boundaries.push({ title: entry.title, lineIndex: foundAt });
    searchFrom = foundAt + 1;
  }

  return boundaries.map((b, i) => {
    const start = b.lineIndex + 1;
    const end = boundaries[i + 1]?.lineIndex ?? lines.length;
    return { title: b.title, lines: lines.slice(start, end) };
  });
}

function splitByHeadingKeywords(lines: string[]): ImportedLesson[] {
  const sections: { title: string; lines: string[] }[] = [];
  let current: { title: string; lines: string[] } | null = null;

  // A document is organized by one label, so split only on the one it uses
  // most. A day-by-day devotional (A 365-Day Journey Through the Bible) has
  // 365 "DAY N" headings and also paragraphs that start "Chapter 12 holds a
  // detail...", which used to break those days in two.
  const labelOf = (line: string) => (headingPattern.test(line) && line.length < 80 ? /^\w+/.exec(line)![0].toLowerCase() : null);
  const labelCounts = new Map<string, number>();
  for (const line of lines) {
    const label = labelOf(line);
    if (label) labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }
  const mainLabel = [...labelCounts].sort((a, b) => b[1] - a[1])[0]?.[0];

  for (const line of lines) {
    if (mainLabel && labelOf(line) === mainLabel) {
      if (current) sections.push(current);
      current = { title: line, lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      // Content before the first detected heading — collect into an intro section.
      if (!sections.length && line) {
        current = { title: "Introduction", lines: [line] };
      }
    }
  }
  if (current) sections.push(current);

  if (sections.length === 0) {
    // No headings detected at all — treat the whole document as one lesson.
    return [{ title: "Imported Content", bodyHtml: paragraphsToHtml(lines) }];
  }

  // An "Introduction" section is only genuine front matter when at least one
  // other real section follows it — see narrowToForewordAndPreface's own
  // comment. When it's the document's only section, nothing heading-shaped
  // was found anywhere at all, and this *is* the whole document, not
  // boilerplate to narrow down.
  if (sections.length > 1 && sections[0]!.title === "Introduction") {
    const kept = narrowToForewordAndPreface(sections[0]!.lines);
    if (kept.length > 0) {
      sections[0]!.lines = kept;
    } else {
      sections.shift();
    }
  }

  return sections.map((s) => ({
    title: s.title,
    bodyHtml: paragraphsToHtml(s.lines),
  }));
}

// A line ending in sentence-terminal punctuation (optionally followed by a
// closing quote/bracket) usually ends a real paragraph.
const SENTENCE_END = /[.!?][”"')\]]*$/;

/**
 * A short line with no sentence-ending punctuation, where every word starts
 * with a capital letter, reads as a sub-heading (e.g. "A QUESTION TO SIT
 * WITH", "Two Trees, Two Soils") rather than body prose -- kept as its own
 * bolded paragraph instead of being folded into the surrounding text.
 */
function looksLikeHeadingLine(line: string): boolean {
  if (!line || line.length > 70 || SENTENCE_END.test(line)) return false;
  const words = line.split(/\s+/).filter(Boolean);
  // A word with no letters at all (a verse number, "1.", a bare "—") doesn't
  // count against the line being heading-shaped -- this lets a verse
  // reference like "COLOSSIANS 1:3–4" or a numbered item like "1. RECEIVE
  // GRACE" qualify, not just a line made entirely of capitalized words.
  return words.length > 0 && words.every((w) => !/[a-zA-Z]/.test(w) || /^[^a-zA-Z]*[A-Z]/.test(w));
}

// The only front-matter section labels worth keeping as a document's
// "Introduction" lesson -- everything else before the first real Week/Day
// heading (a title page, a Table-of-Contents duplicate, a dedication,
// acknowledgments, "how to use this book", ...) is front-matter boilerplate
// that doesn't belong in the app as a lesson's content, not something worth
// reviewing and trimming by hand on every single import.
const FRONT_MATTER_KEEP_HEADING = /^(FOREWORD|PREFACE)\b/i;

// A closed set of OTHER recognized front-matter labels -- seeing one of these
// ends whatever Foreword/Preface section was being kept, the same way the
// document's own real Week/Day heading would. Deliberately a closed set, not
// "any heading-shaped line": an earlier version of this function used
// looksLikeHeadingLine alone to decide when to stop keeping, which let an
// ordinary short, punctuation-free sentence *inside* a real Foreword (a
// pull-quote-style line, a rhetorical device this document family already
// uses elsewhere) silently end the kept section early. Matching this
// project's own established convention elsewhere in this file
// (QUESTION_INLINE/GOING_DEEPER_PREFIX/VERSE_REF_HEADING are closed,
// purpose-built markers too, not a generic "looks like a heading" reuse).
//
// "BEFORE WE BEGIN" is this document family's own lead-in heading for "The
// Six Faces of the Dust" -- a third front-matter essay that, in a real
// document (Colossians), sits directly after the Preface with no other
// heading in between. Without it here, that whole essay (and everything
// after it, up to the first real Week/Day heading) silently rode along as
// if it were still part of the Preface, since nothing told the function to
// stop keeping.
const FRONT_MATTER_END_HEADING =
  /^(ACKNOWLEDG(E)?MENTS?|DEDICATION|COPYRIGHT|CONTENTS|TABLE OF CONTENTS|INTRODUCTION|BEFORE WE BEGIN)\b/i;

// Two more front-matter headings the later manuscripts print in full caps
// after the Preface: the "Before You Begin" essay (Galatians, 1 Peter; it
// extracts as "BEFOREYOUBEGIN" when the letter spacing collapses) and a
// Contents page headed "TWELVE WEEKS IN <BOOK>". Matched case-sensitively,
// unlike the list above, so a Foreword line that happens to start with
// "Before you begin..." or "Twelve weeks in..." can't cut the section short.
// Also "TWELVE WEEKS WITH THE HOLY SPIRIT" and a devotional's "TWELVE MONTHS · 365 DAYS".
// (No word break after WITH: it extracts as "TWELVEWEEKSWITHTHEHOLYSPIRIT".)
const FRONT_MATTER_END_CAPS_HEADING = /^(?:BEFORE ?YOU ?BEGIN\b|TWELVE ?WEEKS ?(?:IN\b|WITH)|TWELVE ?MONTHS\b)/;

// A Table-of-Contents entry for "Foreword"/"Preface" itself ("Foreword
// .......... 3", "Preface 5") matches FRONT_MATTER_KEEP_HEADING's prefix
// check too, but it's a page reference, not the section's real start --
// recognized by the trailing dot-leader/page-number shape, the same way
// extractTableOfContents above tells a TOC entry apart from a real heading.
// Any spacing counts, not just dot leaders: Galatians lists "Preface 4",
// and requiring three dots or spaces let that entry restart the Preface,
// keeping the rest of the contents page in the Introduction.
const TOC_DOT_LEADER_SUFFIX = /(?:[.\s]+|\t+)\d+\s*$/;

/**
 * Narrows a document's front matter (everything before its first real
 * Week/Day heading) down to just its Foreword and/or Preface sections.
 * Starts keeping at a line matching FRONT_MATTER_KEEP_HEADING (that isn't
 * itself a Table-of-Contents page reference) and stops at a line matching
 * FRONT_MATTER_END_HEADING -- both checks also require the line to be
 * heading-shaped (looksLikeHeadingLine), so an ordinary sentence that merely
 * starts with one of these words ("How to use this study was explained
 * yesterday.") is never mistaken for a real section boundary either
 * direction. Returns an empty array when no Foreword/Preface is ever found,
 * so the caller can drop the Introduction lesson entirely rather than
 * publish an empty one.
 */
function narrowToForewordAndPreface(lines: string[]): string[] {
  const kept: string[] = [];
  let keeping = false;
  // A Foreword or Preface heading seen a second time is a contents listing
  // (Genesis Part 1 repeats "FOREWORD ... PREFACE ..." in a second list after
  // the real sections), not the section starting again.
  const keptHeadings = new Set<string>();
  for (const line of lines) {
    const trimmed = line.trim();
    const headingShaped = looksLikeHeadingLine(trimmed);
    const keepHeading = headingShaped && FRONT_MATTER_KEEP_HEADING.exec(trimmed)?.[1]?.toUpperCase();
    if (keepHeading && !TOC_DOT_LEADER_SUFFIX.test(trimmed)) {
      keeping = !keptHeadings.has(keepHeading);
      keptHeadings.add(keepHeading);
    } else if (headingShaped && (FRONT_MATTER_END_HEADING.test(trimmed) || FRONT_MATTER_END_CAPS_HEADING.test(trimmed))) {
      keeping = false;
    }
    if (keeping) kept.push(line);
  }
  return kept;
}

/**
 * pdf-parse's line-based text extraction has no blank line between real
 * paragraphs (only between visually separated blocks, which most PDFs
 * don't encode as blank text at all) -- joining every non-blank line
 * together the way a true paragraph-aware source would need to be split
 * instead collapses an entire section into one giant paragraph. This
 * starts a new paragraph after any line ending in sentence-terminal
 * punctuation, and breaks out a short, heading-shaped line (see
 * looksLikeHeadingLine) as its own paragraph rather than merging it into
 * the prose around it. Still a heuristic over unstructured text, not a
 * reconstruction of the original layout.
 */
function paragraphsToHtml(lines: string[]): string {
  const blocks: { text: string; heading: boolean }[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length) {
      blocks.push({ text: buffer.join(" "), heading: false });
      buffer = [];
    }
  };

  for (const line of lines) {
    if (line === "") {
      flush();
      continue;
    }
    if (looksLikeHeadingLine(line)) {
      flush();
      blocks.push({ text: line, heading: true });
      continue;
    }
    buffer.push(line);
    if (SENTENCE_END.test(line)) flush();
  }
  flush();

  return blocks
    .map((b) => (b.heading ? `<p><strong>${escapeHtml(b.text)}</strong></p>` : `<p>${escapeHtml(b.text)}</p>`))
    .join("\n");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Study (interactive) PDF splitting.
//
// A Study document -- unlike a Devotional -- has two kinds of content a plain
// reading block can't represent: a "QUESTION" with blank lines meant to be
// written in (an input the reader's answer should be saved against), and a
// "Going Deeper" word-study box (a sidebar, not part of the main reading
// flow). Both are split out into their own content blocks instead of being
// folded into surrounding prose.
// ---------------------------------------------------------------------------

export type StudyImportedBlock =
  | { type: "text"; bodyHtml: string }
  | { type: "question"; questionPrompt: string }
  | { type: "callout"; calloutTitle: string; bodyHtml: string };

export type StudyImportedLesson = {
  title: string;
  blocks: StudyImportedBlock[];
};

// A week's own title page reads "WEEK 1", but PDF text extraction often
// merges the roman-numeral page ornament directly in front of it with no
// space ("IWEEK 1", "IIWEEK 2", ... "XIIWEEK 12") -- tolerating an optional
// roman-numeral prefix handles both forms without needing the Table of
// Contents to locate each week (which has its own, differently-shaped
// two-line entries and would need separate handling). Case-sensitive on
// purpose, matching literal "WEEK": every document in this family renders
// the real title-page marker in full caps (a small-caps/display style),
// while the Contents listing and ordinary recap prose both use normal title
// case ("Week N ..."). A recap paragraph that happens to start a wrapped
// line with "Week 4 let the mask fall..." must not be mistaken for a real
// heading -- case is what tells the two apart, since a plain prefix match
// (ignoring case) can't. Some manuscripts (1 Peter) set the title page's
// first letter as its own larger text run, which extracts with a space
// after it ("IIW EEK 2"), so one space is allowed there.
const WEEK_HEADING = /^[IVXLCDM]*\s*W ?EEK\s+\d+\b/;

/**
 * Strips every non-alphanumeric character and uppercases, so a label can be
 * matched whether it was extracted normally ("QUESTION") or with the
 * letter-by-letter spacing small-caps styling sometimes produces
 * ("Q U E S T I O N") -- parsePdfToText already collapses most of that, but
 * this is a cheap second line of defense that costs nothing to keep.
 */
function normalizeMarker(line: string): string {
  return line.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

const GOING_DEEPER_PREFIX = "GOINGDEEPER";

// Matches a "QUESTION" label whether it's alone on its own line (the
// original format this parser was built against, with blank lines below it
// meant to be written in) or immediately followed by the question's own
// text on the same line ("QUESTION Where in your life right now are you
// confessing..." -- a more compact layout some documents in this series
// use instead). Case-sensitive and word-bounded so it doesn't fire on an
// ordinary word that happens to start with the same letters, e.g.
// "Questionable content" at the start of a wrapped line.
const QUESTION_INLINE = /^QUESTION\b[:\s]*/;

// A single verse-reference heading on its own line, e.g. "COLOSSIANS 1:3-4"
// or a numbered book like "1 JOHN 1:9" -- an optional leading book number,
// one book-ish name, and a chapter[:verse] range, nothing else.
// Deliberately excludes a multi-reference citation LIST ("COLOSSIANS 1:2;
// EPHESIANS 2:8; ..."), which belongs inside a callout's body, not acting as
// a new section boundary -- the semicolon is what tells the two apart.
// Some manuscripts (1 Peter) extract with spaces around the punctuation
// ("1 PETER 1 : 18 – 19"), so those spaces are allowed too. The book name
// must be in capitals, as every station's passage heading in this series is:
// a word study's own source line in ordinary case ("Hebrews 1:3", in Dusty
// and Holy) used to match too, cutting that word study off after its first
// line.
// A comma list of verses counts too ("GENESIS 18:27, 32").
const VERSE_REF_HEADING =
  /^(?:[123]\s+)?[A-Z][A-Z]+(?:\s+[A-Z]+)*\s+\d+(?:\s*:\s*\d+)?(?:\s*[–-]\s*\d+(?:\s*:\s*\d+)?)?(?:\s*,\s*\d+(?:\s*[–-]\s*\d+)?)*\s*$/;

// A word study ends with its "LIVE IT:" paragraph in every manuscript in
// this series. Ending the callout there keeps what follows (a pull-quote
// with its citation, the next passage) out of the word-study box.
const LIVE_IT_LINE = /^LIVE IT\b/;
const ENDS_SENTENCE = /[.!?”"’)]\s*$/;

// A line that starts with a scripture reference in any case, alone or as a
// list: "JAMES 1:11", "Hebrews 1:4; 7:19, 22", "ROMANS 3:19; HEBREWS 11:33".
const CITATION_LINE = /^(?:[123]\s+)?[A-Z][A-Za-z]+(?:\s+[A-Za-z]+)*\s+\d+\s*:\s*\d+/;

// The Ten Commandments labels each station "PASSAGE 2 · ROMANS 7 : 7 – 9".
const PASSAGE_HEADING = /^PASSAGE\s+\d+\b/;

// The week's Life Application section follows its last station. Without
// this, nothing ended that station's word-study callout, so the Life
// Application, Daily Prayer, Bottom Line and Benediction were all imported
// inside the final Greek word box. Caps only (also "LIFEAPPLICATION" when
// the letter spacing collapses), so a sentence starting "Life application..."
// can't end a section.
const LIFE_APPLICATION_HEADING = /^LIFE ?APPLICATION\b/;

function isStudySectionBoundary(line: string): boolean {
  if (line === "") return false;
  if (QUESTION_INLINE.test(line)) return true;
  if (LIFE_APPLICATION_HEADING.test(line)) return true;
  if (PASSAGE_HEADING.test(line)) return true;
  const norm = normalizeMarker(line);
  if (norm.startsWith(GOING_DEEPER_PREFIX)) return true;
  if (!line.includes(";") && VERSE_REF_HEADING.test(line)) return true;
  return false;
}

/**
 * Splits a single week's lines into content blocks: a "QUESTION" line pulls
 * in the lines after it (up to the next recognized section boundary) as a
 * question block's prompt; a "Going Deeper" line does the same for a callout
 * block (its first line is the word being studied, kept as the callout's
 * title; everything after is the callout's body). Everything else
 * accumulates as ordinary reading text, flushed into its own text block
 * whenever a question or callout interrupts the flow, so block order matches
 * the document's own order.
 */
function splitWeekIntoBlocks(lines: string[]): StudyImportedBlock[] {
  const blocks: StudyImportedBlock[] = [];
  let textBuffer: string[] = [];

  const flushText = () => {
    const html = paragraphsToHtml(textBuffer);
    if (html) blocks.push({ type: "text", bodyHtml: html });
    textBuffer = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!; // loop bound (i < lines.length) guarantees this index exists

    const inlineQuestionMatch = line !== "" ? line.match(QUESTION_INLINE) : null;
    if (inlineQuestionMatch) {
      flushText();
      const inlineText = line.slice(inlineQuestionMatch[0].length).trim();
      i++;
      const promptLines: string[] = inlineText ? [inlineText] : [];
      while (i < lines.length && lines[i] !== "" && !isStudySectionBoundary(lines[i]!)) {
        promptLines.push(lines[i]!);
        i++;
      }
      const prompt = promptLines.join(" ").trim();
      if (prompt) blocks.push({ type: "question", questionPrompt: prompt });
      continue;
    }

    if (line !== "" && normalizeMarker(line).startsWith(GOING_DEEPER_PREFIX)) {
      flushText();
      i++;
      const calloutLines: string[] = [];
      // Every word study cites its source near the top: a list
      // ("GALATIANS 1:1; HEBREWS 3:1") or a single verse ("JAMES 1:11"). That
      // first citation is the word study's own, so it never ends the box;
      // before this, a single-verse source looked exactly like the next
      // station's passage heading and cut the word study off after its gloss.
      let citedSource = false;
      let inLiveIt = false;
      let liveItDone = false;
      while (i < lines.length) {
        const current = lines[i]!;
        if (liveItDone && current !== "") break;
        if (!citedSource && CITATION_LINE.test(current)) {
          citedSource = true;
        } else if (isStudySectionBoundary(current)) {
          break;
        }
        if (LIVE_IT_LINE.test(current)) inLiveIt = true;
        if (inLiveIt && ENDS_SENTENCE.test(current)) liveItDone = true;
        if (current !== "") calloutLines.push(current);
        i++;
      }
      const title = calloutLines[0] ?? "Going Deeper";
      blocks.push({
        type: "callout",
        calloutTitle: title,
        bodyHtml: paragraphsToHtml(calloutLines.slice(1)),
      });
      continue;
    }

    textBuffer.push(line);
    i++;
  }
  flushText();

  return blocks;
}

/**
 * Splits a Study PDF's extracted text into lessons (one per week), each as
 * an ordered list of content blocks rather than a single HTML body -- see
 * the module comment above. Weeks are found by their own title-page marker
 * ("WEEK 1", "IIWEEK 2", ...), not by locating a Table of Contents first:
 * across the handful of real documents this parser has been run against,
 * the Contents page's own entries for the same week have taken at least
 * three different shapes -- "WEEK N · Book C:V–V · subtitle" (dotted, same
 * case as a real heading), "Week N · Title ###" (title case, with a page
 * number), and "from dust to ___ WEEK N" (the number at the *end* of the
 * line) -- and a real week's own heading has sometimes carried the same
 * kind of "· SOMETHING" suffix a dotted TOC entry does (a movement/theme
 * tag). No single shared trait (a dot, a case, a position) reliably tells a
 * TOC entry apart from a real heading across all of them. What's always
 * true instead is simpler: a Contents listing can only ever come *before*
 * the body it indexes, never after -- so when the same week number's own
 * "WEEK N" marker appears more than once, the LAST occurrence is always the
 * real one and every earlier occurrence is a Contents (or other front-
 * matter) duplicate to discard. A week number that only appears once has no
 * ambiguity to resolve either way. Content before the first real heading is
 * narrowed down to just its Foreword/Preface sections (see
 * narrowToForewordAndPreface) and becomes a leading "Introduction" lesson --
 * the title page, any Contents-page duplicate for week one, and any other
 * front-matter boilerplate are discarded rather than folded in, same
 * convention as the Devotional path. No Foreword or Preface at all means no
 * Introduction lesson. Still a heuristic over unstructured text -- review
 * after import is expected, same as every other import path here.
 */
// Every week's subtitle in this series starts "from dust to ...".
const SUBTITLE_START = /^from dust\b/i;
// A line that is only a Roman numeral (up to 39, enough for any week count).
const ROMAN_NUMERAL_LINE = /^(?=[IVX])X{0,3}(?:IX|IV|V?I{0,3})\.?$/;

export function splitStudyPlainTextByHeadings(text: string): StudyImportedLesson[] {
  const lines = text.split("\n").map((l) => l.trim());

  const lastIndexByWeekNumber = new Map<number, number>();
  lines.forEach((line, i) => {
    const match = WEEK_HEADING.exec(line);
    // WEEK_HEADING's own pattern requires a \d+ group, so a match always
    // contains a number -- this second match just extracts it.
    const weekNumber = match ? Number(match[0].match(/\d+/)![0]) : null;
    if (weekNumber !== null) lastIndexByWeekNumber.set(weekNumber, i);
  });
  const headingIndexes = [...lastIndexByWeekNumber.values()].sort((a, b) => a - b);

  if (headingIndexes.length === 0) {
    return [{ title: "Imported Content", blocks: splitWeekIntoBlocks(lines) }];
  }

  const lessons: StudyImportedLesson[] = [];

  // Intro content is everything before the first real week heading, narrowed
  // down to just its Foreword/Preface sections -- see narrowToForewordAndPreface.
  const firstHeadingIndex = headingIndexes[0]!;
  const introLines = narrowToForewordAndPreface(lines.slice(0, firstHeadingIndex));
  if (introLines.length > 0) {
    lessons.push({ title: "Introduction", blocks: splitWeekIntoBlocks(introLines) });
  }

  for (let w = 0; w < headingIndexes.length; w++) {
    const headingIndex = headingIndexes[w]!;
    const weekNumberMatch = lines[headingIndex]!.match(/\d+/);
    const weekNumber = weekNumberMatch ? weekNumberMatch[0] : String(w + 1);

    // The week's real title is the next non-blank line after its "WEEK N"
    // marker (its title-page heading, e.g. "The Faith That Bears Fruit").
    let titleIndex = headingIndex + 1;
    while (titleIndex < lines.length && lines[titleIndex] === "") titleIndex++;
    // Some title pages set the week's Roman numeral on its own line between
    // "WEEK 1" and the title ("WEEK 1" / "I" / "The Face That Shines"). It's
    // an ornament, not part of the title.
    if (ROMAN_NUMERAL_LINE.test(lines[titleIndex] ?? "")) {
      titleIndex++;
      while (titleIndex < lines.length && lines[titleIndex] === "") titleIndex++;
    }
    let title = lines[titleIndex] || `Week ${weekNumber}`;
    // A long title wraps onto a second line ("The Mountain and the
    // Righteousness That" / "Surpasses"). The week's subtitle always starts
    // "from dust", so a short line sitting between the title and that
    // subtitle is the rest of the title.
    const nextLine = lines[titleIndex + 1] ?? "";
    if (nextLine && nextLine.length <= 40 && !SUBTITLE_START.test(nextLine) && SUBTITLE_START.test(lines[titleIndex + 2] ?? "")) {
      title = `${title} ${nextLine}`;
      titleIndex++;
    }

    const bodyStart = titleIndex + 1;
    const bodyEnd = headingIndexes[w + 1] ?? lines.length;

    lessons.push({
      title: `Week ${weekNumber}: ${title}`,
      blocks: splitWeekIntoBlocks(lines.slice(bodyStart, bodyEnd)),
    });
  }

  return lessons;
}
