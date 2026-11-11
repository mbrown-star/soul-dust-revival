import { ensurePdfTextExtractionGlobals } from "./pdfTextExtractionGlobals";

/**
 * Extracts plain text from a PDF. Unlike DOCX, PDFs don't preserve heading
 * styles in an easily accessible way — this returns raw text, and heading
 * detection for lesson-splitting is done heuristically (see splitIntoLessons.ts).
 *
 * pdf-parse (via pdfjs-dist) is marked external in next.config.js's
 * serverExternalPackages -- see the comment there for why.
 */
export async function parsePdfToText(buffer: Buffer): Promise<string> {
  // Must run before pdf-parse's own module evaluation touches pdfjs-dist's
  // text-layer code -- see pdfTextExtractionGlobals.ts for why this is
  // needed in the Workers runtime. A plain top-of-file `import { PDFParse }
  // from "pdf-parse"` doesn't give this ordering: static imports are
  // hoisted and evaluated before any of this module's own code runs
  // (including this function), so pdf-parse's own internal canvas-polyfill
  // attempt was still firing -- and still failing -- before this call ever
  // got a chance to run (confirmed live via `wrangler tail`: the fix had no
  // effect at all on the first deploy). A dynamic import runs exactly where
  // it's awaited, so this ordering is now actually enforced.
  await ensurePdfTextExtractionGlobals();
  const { PDFParse } = await import("pdf-parse");

  const parser = new PDFParse({ data: buffer });
  try {
    // pdf-parse's default pageJoiner appends a "-- N of total --" marker
    // after every page's text -- that's the parser's own page-boundary
    // notation, not real document content, and was leaking into lesson
    // bodies as a stray trailing line on every page.
    const result = await parser.getText({ pageJoiner: "" });
    const text = stripRunningHeadersAndFooters(result.pages.map((p) => p.text));
    return text
      // A decorative ornament can extract as a NUL byte (The Holy Spirit has
      // 12, one between sections), and Postgres rejects NUL in text, failing
      // the whole import. Other invisible control characters go too; tabs and
      // line breaks stay.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .split("\n")
      .filter((line) => !isBarePageNumber(line))
      .map(collapseLetterSpacing)
      .join("\n");
  } finally {
    await parser.destroy();
  }
}

// A printed page's own footer page number ("19", "20", ...) is extracted as
// real text exactly like body content -- unlike a repeated running
// header/footer string, a bare number has nothing else to recur on (it's
// different on every page), so stripRunningHeadersAndFooters' frequency
// check can't catch it. A standalone 1-4 digit line is never meaningful
// lesson content on its own, so it's dropped outright.
function isBarePageNumber(line: string): boolean {
  return /^\d{1,4}$/.test(line.trim());
}

/**
 * Small-caps / letter-tracked styling is sometimes extracted with a space
 * between every character (e.g. "G e n e s i s 2 : 7" or
 * "S O U L D U S T R E V I V A L"). When most of a line's tokens are a
 * single character, this collapses consecutive single-letter tokens back
 * into words and consecutive single-digit tokens back into numbers, leaving
 * genuine multi-character words and punctuation untouched.
 */
function collapseLetterSpacing(line: string): string {
  const tokens = line.split(" ");
  if (tokens.length < 4) return line;

  const singleCharTokens = tokens.filter((t) => t.length === 1).length;
  if (singleCharTokens / tokens.length < 0.6) return line;

  const words: string[] = [];
  let run = "";
  let runIsDigits = false;

  const flush = () => {
    if (run) words.push(run);
    run = "";
  };

  for (const token of tokens) {
    const isSingleAlpha = token.length === 1 && /[a-zA-Z]/.test(token);
    const isSingleDigit = token.length === 1 && /[0-9]/.test(token);

    if (isSingleAlpha || isSingleDigit) {
      if (run && runIsDigits !== isSingleDigit) flush(); // letter-run meeting a digit-run (or vice versa)
      run += token;
      runIsDigits = isSingleDigit;
    } else {
      flush();
      words.push(token);
    }
  }
  flush();

  return words.join(" ");
}

// How many lines at the very top/bottom of a page count as "header/footer
// position" -- deliberately narrow. A wider window risks reaching into the
// page's actual first/last paragraph.
const EDGE_LINE_COUNT = 2;

/**
 * A print-ready PDF (e.g. a KDP export) typically repeats a running header
 * or footer -- the book title, a page number -- as real text on every page,
 * and pdf-parse extracts it exactly like body content; there's no
 * structural way to tell the two apart except position. Detected
 * generically, not tied to any one document, by frequency *at the top or
 * bottom of the page specifically*: a line recurring there on most pages is
 * almost certainly page furniture. Checking the whole page (not just its
 * edges) was tried first and over-fired on a document whose actual content
 * repeats a structural label on nearly every page by design (e.g. a
 * devotional's "Lift Up Your Eyes" callout, present on all 365 days) --
 * restricting the frequency check to genuine header/footer position avoids
 * mistaking real, repeated body content for page furniture.
 */
function stripRunningHeadersAndFooters(pageTexts: string[]): string {
  if (pageTexts.length < 4) return pageTexts.join("\n");

  const normalize = (line: string) => line.trim().replace(/\d+\s*$/, "").trim();
  const edgeLinesOf = (pageText: string): string[] => {
    const nonEmpty = pageText.split("\n").filter((l) => l.trim() !== "");
    return [...nonEmpty.slice(0, EDGE_LINE_COUNT), ...nonEmpty.slice(-EDGE_LINE_COUNT)];
  };

  const pageCountByLine = new Map<string, number>();
  for (const pageText of pageTexts) {
    const seenOnThisPage = new Set(
      edgeLinesOf(pageText)
        .map(normalize)
        .filter((key) => key.length >= 4)
    );
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
