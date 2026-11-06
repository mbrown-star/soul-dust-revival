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

function paragraphsToHtml(lines: string[]): string {
  const paragraphs: string[] = [];
  let buffer: string[] = [];

  for (const line of lines) {
    if (line === "") {
      if (buffer.length) {
        paragraphs.push(buffer.join(" "));
        buffer = [];
      }
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length) paragraphs.push(buffer.join(" "));

  return paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
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
