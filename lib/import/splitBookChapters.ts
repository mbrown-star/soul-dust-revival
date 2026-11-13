import { buildBookChapterOpener } from "@/lib/book/chapterHtml";

/**
 * Splits a Soul Dust Revival book (Revive Me) into its Introduction and
 * chapters, from `pdftotext -layout -nopgbrk` output. Layout mode is used
 * (not the app's pdf-parse import) because it keeps each line's indent, and
 * in these books a paragraph starts with an indented line; pdf-parse drops
 * the indent, so paragraphs can only be guessed.
 *
 * The book's shape, which every chapter follows:
 *   PARTONE / The Dust / tagline / anchor verse            (a Part page)
 *   CHAPTER ONE / title / "from dust to honesty" / “verse” / GENESIS 2:7
 *   …text, with short unpunctuated lines as sub-headings…
 *   TO SIT WITH / "1 question" / "2 question"
 *   BENEDICTION / Lift Up Your Eyes / paragraphs
 *   END OF CHAPTER ONE · SOUL DUST REVIVAL
 * The Epilogue has the same shape under EPILOGUE.
 *
 * `warnings` lists anything that didn't fit; the import script refuses to
 * write while there are any.
 */

export type BookChapter = {
  kind: "chapter" | "epilogue";
  number: number | null;
  /** "Chapter 1: Where Most Men Actually Live" / "Epilogue: From Dust to Glory" */
  lessonTitle: string;
  part: string | null;
  title: string;
  subtitle: string | null;
  epigraph: { text: string; reference: string } | null;
  /** The opener plus the chapter's text, as the reader stores it. */
  textHtml: string;
  headings: string[];
  questions: string[];
  benedictionTitle: string;
  benedictionHtml: string;
};

export type ParsedBook = {
  introductionHtml: string;
  chapters: BookChapter[];
  warnings: string[];
};

const NUMBER_WORDS: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10,
  ELEVEN: 11, TWELVE: 12, THIRTEEN: 13, FOURTEEN: 14, FIFTEEN: 15, SIXTEEN: 16, SEVENTEEN: 17,
  EIGHTEEN: 18, NINETEEN: 19, TWENTY: 20, THIRTY: 30,
};

const PART_WORDS = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN"];

function wordsToNumber(words: string): number | null {
  let total = 0;
  for (const word of words.split("-")) {
    const value = NUMBER_WORDS[word];
    if (value === undefined) return null;
    total += value;
  }
  return total || null;
}

function titleCaseWord(word: string): string {
  return word.charAt(0) + word.slice(1).toLowerCase();
}

/** "PART" + "ONE" -> "Part One". */
function partLabel(word: string): string {
  return `Part ${titleCaseWord(word)}`;
}

/** "GENESIS 2:7" -> "Genesis 2:7", "1 JOHN 1:9" -> "1 John 1:9", "SONG OF SOLOMON 2:4" -> "Song of Solomon 2:4". */
export function formatReference(reference: string): string {
  return reference
    .trim()
    .split(/\s+/)
    .map((word, i) => (/^(OF|AND)$/.test(word) && i > 0 ? word.toLowerCase() : /[A-Z]/.test(word) ? titleCaseWord(word) : word))
    .join(" ");
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Appends a wrapped line, rejoining a word the layout broke with a hyphen. */
function joinLine(paragraph: string, line: string): string {
  if (!paragraph) return line;
  if (/[A-Za-z]-$/.test(paragraph) && /^[a-z]/.test(line)) return paragraph.slice(0, -1) + line;
  return `${paragraph} ${line}`;
}

const indentOf = (line: string) => line.length - line.trimStart().length;
const endsSentence = (text: string) => /[.!?:”’"]$/.test(text.trim());
const isAllCaps = (text: string) => /[A-Z]/.test(text) && !/[a-z]/.test(text);

type Block =
  | { kind: "p"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "lines"; lines: string[] }
  | { kind: "quote"; text: string; reference: string | null };

/**
 * Lines -> paragraphs. A paragraph starts at an indented line or a sub-heading.
 * With `blankBreaks`, a blank line also ends a paragraph when the text before
 * it finishes a sentence (blessings and the Foreword are spaced that way);
 * without it, blank lines are only page breaks and the text runs on.
 */
function toBlocks(lines: string[], { blankBreaks, headings }: { blankBreaks: boolean; headings: boolean }): Block[] {
  const blocks: Block[] = [];
  let paragraph = "";
  let afterBlank = true;
  let group: string[] = [];

  const flush = () => {
    if (paragraph.trim()) blocks.push({ kind: "p", text: paragraph.trim() });
    paragraph = "";
  };

  // Under blankBreaks, a run of two or more short lines with no blank between
  // them (a signature: "In the dust, and yet not without hope," / "The Soul
  // Dust Team") keeps its line breaks.
  const flushGroup = () => {
    if (group.length >= 2 && group.every((l) => l.length <= 50)) {
      blocks.push({ kind: "lines", lines: group });
    } else {
      for (const line of group) paragraph = joinLine(paragraph, line);
    }
    group = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (!line) {
      if (blankBreaks) {
        flushGroup();
        if (endsSentence(paragraph)) flush();
      }
      afterBlank = true;
      continue;
    }
    const indent = indentOf(raw);
    const next = lines.slice(i + 1).find((l) => l.trim());
    const isHeading =
      headings &&
      afterBlank &&
      indent === 0 &&
      line.length <= 70 &&
      /^[A-Z“"]/.test(line) &&
      !/[.,;:!?”’")\-—]$/.test(line) &&
      !!next;
    if (isHeading) {
      flushGroup();
      flush();
      blocks.push({ kind: "h3", text: line });
    } else if (indent >= 2 && !blankBreaks && isScriptureQuote(lines, i, indent)) {
      // Scripture set apart: every line at the same indent, the last one its
      // reference in capitals ("HOSEA 2:19–20"). A paragraph's first line is
      // indented but the lines after it aren't.
      flush();
      const run = sameIndentRun(lines, i, indent);
      const quoteLines = lines.slice(i, i + run).map((l) => l.trim());
      const last = quoteLines[quoteLines.length - 1]!;
      const reference = isReferenceLine(last) ? formatReference(quoteLines.pop()!) : null;
      blocks.push({ kind: "quote", text: quoteLines.reduce(joinLine, ""), reference });
      i += run - 1;
    } else if (indent >= 2) {
      flushGroup();
      flush();
      if (blankBreaks) group.push(line);
      else paragraph = line;
    } else if (blankBreaks) {
      // Kept apart until the next blank, to tell a signature from a paragraph.
      if (afterBlank && group.length === 0 && paragraph) {
        if (endsSentence(paragraph)) flush();
      }
      group.push(line);
    } else {
      paragraph = joinLine(paragraph, line);
    }
    afterBlank = false;
  }
  flushGroup();
  flush();
  return blocks;
}

const isReferenceLine = (line: string) => isAllCaps(line) && /\d/.test(line);

/**
 * A quote is two or more lines at one indent ending in its reference. One-line
 * paragraphs in a row also share an indent, but never end in a reference.
 */
function isScriptureQuote(lines: string[], from: number, indent: number): boolean {
  const run = sameIndentRun(lines, from, indent);
  return run >= 2 && isReferenceLine(lines[from + run - 1]!.trim());
}

/** How many lines from `from` on share exactly this indent, with no blank between. */
function sameIndentRun(lines: string[], from: number, indent: number): number {
  let n = 0;
  while (from + n < lines.length && lines[from + n]!.trim() && indentOf(lines[from + n]!) === indent) n++;
  return n;
}

function blocksToHtml(blocks: Block[]): string {
  return blocks
    .map((b) =>
      b.kind === "h3"
        ? `<h3>${escapeHtml(b.text)}</h3>`
        : b.kind === "lines"
          ? `<p>${b.lines.map(escapeHtml).join("<br>")}</p>`
          : b.kind === "quote"
            ? `<blockquote><p>${escapeHtml(b.text)}</p>${b.reference ? `<p>— ${escapeHtml(b.reference)}</p>` : ""}</blockquote>`
            : `<p>${escapeHtml(b.text)}</p>`
    )
    .join("");
}

const PAGE_FURNITURE = [
  /^\d{1,3}$/, // page numbers and the big chapter numeral
  /^SOUL DUST REVIVAL · .+$/, // running header
  /^END OF (CHAPTER [A-Z-]+|THE EPILOGUE) · SOUL DUST REVIVAL$/,
];

/**
 * Page furniture inside a chapter: page numbers, the running headers (the
 * book's name, or the chapter title in capitals, both centered) and the
 * END OF … line.
 */
function isFurniture(raw: string): boolean {
  const line = raw.trim();
  if (!line) return false;
  if (PAGE_FURNITURE.some((re) => re.test(line))) return true;
  return indentOf(raw) >= 10 && isAllCaps(line);
}

export function splitBookLayoutText(layoutText: string): ParsedBook {
  // pdftotext writes a form feed for the "f" glyph in this book's font;
  // run with -nopgbrk, a form feed is never a page break.
  const lines = layoutText.replace(/\f/g, "f").split("\n").map((l) => l.replace(/\s+$/, ""));
  const warnings: string[] = [];
  const trimmed = lines.map((l) => l.trim());

  // --- Introduction: the Foreword and the Preface, up to the contents page.
  const forewordAt = trimmed.indexOf("FOREWORD");
  const contentsAt = trimmed.indexOf("Contents");
  if (forewordAt < 0 || contentsAt < 0) warnings.push("No FOREWORD or Contents line found.");
  let introductionHtml = "";
  if (forewordAt >= 0 && contentsAt > forewordAt) {
    // The line just above "Contents" is its eyebrow ("TWENTY-SIX CHAPTERS AND AN EPILOGUE").
    let end = contentsAt - 1;
    while (end > forewordAt && !trimmed[end]) end--;
    if (isAllCaps(trimmed[end]!)) end--;
    introductionHtml = splitIntroduction(lines.slice(forewordAt, end + 1));
  }

  // --- Chapters, after the contents page.
  const chapters: BookChapter[] = [];
  let currentPart: string | null = null;
  let i = contentsAt + 1;
  // Skip the contents listing: it ends at the first Part page.
  while (i < lines.length && !/^PART ?[A-Z]+$/.test(trimmed[i]!)) i++;

  while (i < lines.length) {
    const line = trimmed[i]!;
    const partMatch = line.match(/^PART ?([A-Z]+)$/);
    if (partMatch && PART_WORDS.includes(partMatch[1]!)) {
      const titleAt = nextNonBlank(trimmed, i + 1);
      const title = titleAt >= 0 ? trimmed[titleAt]! : "";
      currentPart = title ? `${partLabel(partMatch[1]!)} · ${title}` : partLabel(partMatch[1]!);
      i = titleAt >= 0 ? titleAt + 1 : i + 1;
      continue;
    }
    const chapterMatch = line.match(/^CHAPTER ([A-Z-]+)$/);
    if (chapterMatch || line === "EPILOGUE") {
      const number = chapterMatch ? wordsToNumber(chapterMatch[1]!) : null;
      if (chapterMatch && number === null) warnings.push(`Unknown chapter number: ${line}`);
      const end = findChapterEnd(trimmed, i + 1);
      const chapter = parseChapter(lines.slice(i + 1, end), {
        kind: chapterMatch ? "chapter" : "epilogue",
        number,
        part: chapterMatch ? currentPart : null,
        warnings,
      });
      if (chapter) chapters.push(chapter);
      i = end;
      continue;
    }
    i++;
  }

  if (chapters.length === 0) warnings.push("No chapters found.");
  return { introductionHtml, chapters, warnings };
}

function nextNonBlank(trimmed: string[], from: number): number {
  for (let i = from; i < trimmed.length; i++) if (trimmed[i]) return i;
  return -1;
}

function findChapterEnd(trimmed: string[], from: number): number {
  for (let i = from; i < trimmed.length; i++) {
    if (/^END OF (CHAPTER [A-Z-]+|THE EPILOGUE) · SOUL DUST REVIVAL$/.test(trimmed[i]!)) return i + 1;
    if (/^CHAPTER [A-Z-]+$/.test(trimmed[i]!) || /^PART ?[A-Z]+$/.test(trimmed[i]!) || trimmed[i] === "EPILOGUE") return i;
  }
  return trimmed.length;
}

function parseChapter(
  lines: string[],
  ctx: { kind: "chapter" | "epilogue"; number: number | null; part: string | null; warnings: string[] }
): BookChapter | null {
  const trimmed = lines.map((l) => l.trim());
  const where = ctx.kind === "chapter" ? `Chapter ${ctx.number}` : "Epilogue";

  // Title (one or more centered lines) up to the "from … to …" line.
  let i = nextNonBlank(trimmed, 0);
  const titleLines: string[] = [];
  while (i >= 0 && i < trimmed.length && trimmed[i] && !/^from /.test(trimmed[i]!)) {
    titleLines.push(trimmed[i]!);
    i++;
    if (!trimmed[i]) i = nextNonBlank(trimmed, i);
    if (titleLines.length > 3) break;
  }
  const title = titleLines.join(" ");
  let subtitle: string | null = null;
  if (i >= 0 && /^from /.test(trimmed[i] ?? "")) {
    subtitle = trimmed[i]!;
    i++;
  } else {
    ctx.warnings.push(`${where}: no "from … to …" line after the title.`);
  }
  if (!title) {
    ctx.warnings.push(`${where}: no title.`);
    return null;
  }

  // Epigraph: quoted lines, then the reference in capitals.
  let epigraph: BookChapter["epigraph"] = null;
  i = nextNonBlank(trimmed, i);
  if (i >= 0 && trimmed[i]!.startsWith("“")) {
    let text = "";
    while (i < trimmed.length && trimmed[i] && !(isAllCaps(trimmed[i]!) && /\d/.test(trimmed[i]!))) {
      text = joinLine(text, trimmed[i]!);
      i++;
    }
    const reference = trimmed[i] ?? "";
    if (isAllCaps(reference) && /\d/.test(reference)) {
      epigraph = { text, reference: formatReference(reference) };
      i++;
    } else {
      ctx.warnings.push(`${where}: no reference under the opening verse.`);
    }
  }

  const sitAt = trimmed.indexOf("TO SIT WITH", i);
  const benedictionAt = trimmed.indexOf("BENEDICTION", Math.max(i, sitAt));
  if (sitAt < 0) ctx.warnings.push(`${where}: no TO SIT WITH.`);
  if (benedictionAt < 0) ctx.warnings.push(`${where}: no BENEDICTION.`);
  const bodyEnd = sitAt >= 0 ? sitAt : benedictionAt >= 0 ? benedictionAt : lines.length;

  const bodyLines = lines.slice(i, bodyEnd).filter((l) => !isFurniture(l));
  const bodyBlocks = toBlocks(bodyLines, { blankBreaks: false, headings: true });
  const headings = bodyBlocks.filter((b) => b.kind === "h3").map((b) => b.text);
  if (bodyBlocks.filter((b) => b.kind === "p").length < 3) ctx.warnings.push(`${where}: fewer than 3 paragraphs.`);

  // Questions: "1 …" and "2 …", wrapped lines continuing the one before.
  const questions: string[] = [];
  if (sitAt >= 0) {
    for (const raw of lines.slice(sitAt + 1, benedictionAt >= 0 ? benedictionAt : lines.length)) {
      const line = raw.trim();
      if (!line || isFurniture(raw)) continue;
      const numbered = line.match(/^(\d)\s+(.+)$/);
      if (numbered) questions.push(numbered[2]!);
      else if (questions.length > 0) questions[questions.length - 1] = joinLine(questions[questions.length - 1]!, line);
      else ctx.warnings.push(`${where}: text before the first question: ${line.slice(0, 40)}`);
    }
    if (questions.length === 0) ctx.warnings.push(`${where}: no questions under TO SIT WITH.`);
  }

  // Blessing: its title line, then blank-spaced paragraphs.
  let benedictionTitle = "Lift Up Your Eyes";
  let benedictionHtml = "";
  if (benedictionAt >= 0) {
    const titleAt = nextNonBlank(trimmed, benedictionAt + 1);
    if (titleAt >= 0) benedictionTitle = trimmed[titleAt]!;
    const blessingLines = lines.slice(titleAt + 1).filter((l) => !isFurniture(l));
    benedictionHtml = blocksToHtml(toBlocks(blessingLines, { blankBreaks: true, headings: false }));
    if (!benedictionHtml) ctx.warnings.push(`${where}: empty blessing.`);
  }

  const opener = buildBookChapterOpener({ part: ctx.part, title, subtitle, epigraph });
  const label = ctx.kind === "chapter" ? `Chapter ${ctx.number}` : "Epilogue";
  return {
    kind: ctx.kind,
    number: ctx.number,
    lessonTitle: `${label}: ${title}`,
    part: ctx.part,
    title,
    subtitle,
    epigraph,
    textHtml: opener + blocksToHtml(bodyBlocks),
    headings,
    questions,
    benedictionTitle,
    benedictionHtml,
  };
}

/** FOREWORD / its subtitle / text …, PREFACE / its subtitle / text …, as Introduction sections. */
function splitIntroduction(lines: string[]): string {
  const html: string[] = [];
  let section: string[] = [];
  const flushSection = () => {
    if (section.length === 0) return;
    // The publisher line under the Foreword's signature is page furniture.
    const kept = section.filter((l) => !(isAllCaps(l.trim()) && l.trim().length > 0));
    html.push(blocksToHtml(toBlocks(kept, { blankBreaks: true, headings: false })));
    section = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "FOREWORD" || line === "PREFACE") {
      flushSection();
      html.push(`<h2>${line === "FOREWORD" ? "Foreword" : "Preface"}</h2>`);
      const subtitleAt = lines.findIndex((l, j) => j > i && l.trim());
      if (subtitleAt > 0) {
        html.push(`<p><em>${escapeHtml(lines[subtitleAt]!.trim())}</em></p>`);
        i = subtitleAt;
      }
      continue;
    }
    section.push(lines[i]!);
  }
  flushSection();
  return html.join("");
}
