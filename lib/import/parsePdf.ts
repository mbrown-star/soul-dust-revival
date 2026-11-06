import { PDFParse } from "pdf-parse";

/**
 * Extracts plain text from a PDF. Unlike DOCX, PDFs don't preserve heading
 * styles in an easily accessible way — this returns raw text, and heading
 * detection for lesson-splitting is done heuristically (see splitIntoLessons.ts).
 *
 * pdf-parse (via pdfjs-dist) is marked external in next.config.js's
 * serverExternalPackages -- see the comment there for why.
 */
export async function parsePdfToText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    // pdf-parse's default pageJoiner appends a "-- N of total --" marker
    // after every page's text -- that's the parser's own page-boundary
    // notation, not real document content, and was leaking into lesson
    // bodies as a stray trailing line on every page.
    const result = await parser.getText({ pageJoiner: "" });
    return stripRunningHeadersAndFooters(result.pages.map((p) => p.text));
  } finally {
    await parser.destroy();
  }
}

/**
 * A print-ready PDF (e.g. a KDP export) typically repeats a running header
 * or footer -- the book title, a page number -- as real text on every page,
 * and pdf-parse extracts it exactly like body content; there's no
 * structural way to tell the two apart. Detected generically, not tied to
 * any one document, by frequency: a line that recurs (after stripping a
 * trailing page number) on most pages is almost certainly page furniture
 * rather than a single page's actual content, and is removed everywhere it
 * appears.
 */
function stripRunningHeadersAndFooters(pageTexts: string[]): string {
  if (pageTexts.length < 4) return pageTexts.join("\n");

  const normalize = (line: string) => line.trim().replace(/\d+\s*$/, "").trim();

  const pageCountByLine = new Map<string, number>();
  for (const pageText of pageTexts) {
    const seenOnThisPage = new Set<string>();
    for (const rawLine of pageText.split("\n")) {
      const key = normalize(rawLine);
      if (key.length >= 4) seenOnThisPage.add(key);
    }
    for (const key of seenOnThisPage) {
      pageCountByLine.set(key, (pageCountByLine.get(key) ?? 0) + 1);
    }
  }

  const threshold = Math.max(4, Math.ceil(pageTexts.length * 0.4));
  const runningLines = new Set(
    [...pageCountByLine.entries()].filter(([, count]) => count >= threshold).map(([key]) => key)
  );
  if (runningLines.size === 0) return pageTexts.join("\n");

  return pageTexts
    .map((pageText) =>
      pageText
        .split("\n")
        .filter((line) => !runningLines.has(normalize(line)))
        .join("\n")
    )
    .join("\n");
}
