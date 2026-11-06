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

  for (const line of lines) {
    if (headingPattern.test(line) && line.length < 80) {
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
// two-line entries and would need separate handling).
const WEEK_HEADING = /^[IVXLCDM]*\s*WEEK\s+\d+\b/i;

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

const QUESTION_MARKER = "QUESTION";
const GOING_DEEPER_PREFIX = "GOINGDEEPER";

// A single verse-reference heading on its own line, e.g. "COLOSSIANS 1:3-4"
// -- one book-ish name and a chapter[:verse] range, nothing else.
// Deliberately excludes a multi-reference citation LIST ("COLOSSIANS 1:2;
// EPHESIANS 2:8; ..."), which belongs inside a callout's body, not acting as
// a new section boundary -- the semicolon is what tells the two apart.
const VERSE_REF_HEADING = /^[A-Z][A-Za-z]+(?:\s+[A-Za-z]+)*\s+\d+(?::\d+)?(?:[–-]\d+(?::\d+)?)?\s*$/;

function isStudySectionBoundary(line: string): boolean {
  if (line === "") return false;
  const norm = normalizeMarker(line);
  if (norm === QUESTION_MARKER) return true;
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

    if (line !== "" && normalizeMarker(line) === QUESTION_MARKER) {
      flushText();
      i++;
      const promptLines: string[] = [];
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
      while (i < lines.length && !isStudySectionBoundary(lines[i]!)) {
        if (lines[i] !== "") calloutLines.push(lines[i]!);
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
 * A Study document's Contents page lists each week as "WEEK N · Book C:V–V
 * · subtitle" (with a trailing page number before parsePdfToText strips
 * it) -- that line matches WEEK_HEADING too, and without being excluded it
 * would be mistaken for the week's real body heading. Distinguished from
 * the real one by a middle dot: the TOC's line always has one (it's a
 * single-line "Title · ref · subtitle" entry), the body's own title-page
 * marker never does (it's bare, e.g. "IWEEK 1"). Returns the "Contents"
 * heading's own index and the index just past the last TOC-shaped week
 * line, so the caller can exclude exactly that range -- not everything
 * before it, which would also discard a real foreword/preface that comes
 * *before* the Contents page. {start: -1, end: 0} means no Contents page
 * was found at all.
 */
function findStudyTocRange(lines: string[]): { start: number; end: number } {
  const contentsIndex = lines.findIndex((l) => /^(table of contents|contents)$/i.test(l));
  if (contentsIndex === -1) return { start: -1, end: 0 };

  let i = contentsIndex + 1;
  let tocEnd = contentsIndex + 1;
  while (i < lines.length) {
    const line = lines[i]!; // loop bound (i < lines.length) guarantees this index exists
    if (line === "") {
      i++;
      continue;
    }

    if (WEEK_HEADING.test(line) && line.includes("·")) {
      tocEnd = i + 1;
      i++;
      continue;
    }
    // A plain title line immediately followed by a TOC-shaped week line is
    // that entry's title, still part of the TOC block.
    const next = lines[i + 1];
    if (next !== undefined && WEEK_HEADING.test(next) && next.includes("·")) {
      i++;
      continue;
    }
    break;
  }
  return { start: contentsIndex, end: tocEnd };
}

/**
 * Splits a Study PDF's extracted text into lessons (one per week), each as
 * an ordered list of content blocks rather than a single HTML body -- see
 * the module comment above. Weeks are found directly by their own title-page
 * marker ("WEEK 1", "IIWEEK 2", ...), which is simpler and more reliable
 * here than table-of-contents matching: it's a single, unambiguous line that
 * appears exactly once per week, right where each week actually begins.
 * Content before the first week heading (a foreword/preface) becomes a
 * leading "Introduction" lesson, same convention as the Devotional path.
 * Still a heuristic over unstructured text -- review after import is
 * expected, same as every other import path here.
 */
export function splitStudyPlainTextByHeadings(text: string): StudyImportedLesson[] {
  const lines = text.split("\n").map((l) => l.trim());
  const tocRange = findStudyTocRange(lines);

  const headingIndexes: number[] = [];
  lines.forEach((line, i) => {
    // The Contents page's own entries ("WEEK 2 · Colossians 1:9–14 · from
    // dust to the kingdom of light") also match WEEK_HEADING -- without
    // skipping the TOC block first, every week would get a second, spurious
    // "heading" there and the whole split would be shifted and mistitled.
    if (i >= tocRange.end && WEEK_HEADING.test(line)) headingIndexes.push(i);
  });

  if (headingIndexes.length === 0) {
    return [{ title: "Imported Content", blocks: splitWeekIntoBlocks(lines) }];
  }

  const lessons: StudyImportedLesson[] = [];

  // Intro content is everything before the first real week heading, except
  // the Table of Contents listing itself (its own line range, found above --
  // not just "everything before tocRange.end", which would also discard a
  // real foreword/preface that comes *before* the Contents page).
  const firstHeadingIndex = headingIndexes[0]!;
  const introLineIndexes = Array.from({ length: firstHeadingIndex }, (_, i) => i).filter(
    (i) => !(tocRange.start !== -1 && i >= tocRange.start && i < tocRange.end)
  );
  const introLines = introLineIndexes.map((i) => lines[i]!);
  if (introLines.some((l) => l !== "")) {
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
    const title = lines[titleIndex] || `Week ${weekNumber}`;

    const bodyStart = titleIndex + 1;
    const bodyEnd = headingIndexes[w + 1] ?? lines.length;

    lessons.push({
      title: `Week ${weekNumber}: ${title}`,
      blocks: splitWeekIntoBlocks(lines.slice(bodyStart, bodyEnd)),
    });
  }

  return lessons;
}
