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

/**
 * Splits plain text (from a PDF) into lessons using a heuristic: lines that
 * look like "Week 1", "Lesson 3: Title", "Session 2", etc. are treated as
 * headings. PDFs don't preserve style info the way Word docs do, so this is
 * inherently less reliable than the DOCX path — review after import is expected.
 */
export function splitPlainTextByHeadings(text: string): ImportedLesson[] {
  const lines = text.split("\n").map((l) => l.trim());
  const headingPattern = /^(week|lesson|session|chapter|part)\s+\d+/i;

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
