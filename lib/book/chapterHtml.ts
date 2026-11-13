import { htmlToPlainText } from "@/lib/content/plainText";

/**
 * A book chapter (study kind "book", e.g. Revive Me) is stored as ordinary
 * content blocks: a text block holding the chapter's opener and its text,
 * the chapter's "To Sit With" questions as question blocks, and its closing
 * blessing as a callout. The opener is plain sanitized HTML in one fixed
 * shape, written by `buildBookChapterOpener` and read back by
 * `parseBookChapterHtml`, so the reader can lay it out without a new column:
 *
 *   <p><strong>Part One · The Dust</strong></p>   (optional)
 *   <h2>Where Most Men Actually Live</h2>
 *   <p><em>from dust to honesty</em></p>           (optional)
 *   <blockquote><p>“…verse…”</p><p>— Genesis 2:7</p></blockquote>  (optional)
 *   …the chapter's text…
 */

export type BookChapterOpener = {
  part: string | null;
  title: string;
  subtitle: string | null;
  epigraph: { text: string; reference: string } | null;
};

export type ParsedBookChapter = BookChapterOpener & { bodyHtml: string };

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildBookChapterOpener(opener: BookChapterOpener): string {
  const parts: string[] = [];
  if (opener.part) parts.push(`<p><strong>${escapeHtml(opener.part)}</strong></p>`);
  parts.push(`<h2>${escapeHtml(opener.title)}</h2>`);
  if (opener.subtitle) parts.push(`<p><em>${escapeHtml(opener.subtitle)}</em></p>`);
  if (opener.epigraph) {
    parts.push(
      `<blockquote><p>${escapeHtml(opener.epigraph.text)}</p><p>— ${escapeHtml(opener.epigraph.reference)}</p></blockquote>`
    );
  }
  return parts.join("");
}

const PART = /^\s*<p><strong>(Part [^<]{1,120})<\/strong><\/p>/;
const TITLE = /^\s*<h2>([^<]{1,300})<\/h2>/;
const SUBTITLE = /^\s*<p><em>([^<]{1,300})<\/em><\/p>/;
const EPIGRAPH = /^\s*<blockquote><p>([\s\S]{1,2000}?)<\/p><p>— ([^<]{1,200})<\/p><\/blockquote>/;

/**
 * Splits a chapter's first text block into its opener and its text. Returns
 * null when the block doesn't start with the opener (an admin rewrote it),
 * so the reader can fall back to showing the HTML as it is.
 */
export function parseBookChapterHtml(html: string): ParsedBookChapter | null {
  let rest = html;
  let part: string | null = null;
  const partMatch = rest.match(PART);
  if (partMatch) {
    part = htmlToPlainText(partMatch[1]);
    rest = rest.slice(partMatch[0].length);
  }
  const titleMatch = rest.match(TITLE);
  if (!titleMatch) return null;
  const title = htmlToPlainText(titleMatch[1]);
  rest = rest.slice(titleMatch[0].length);

  let subtitle: string | null = null;
  const subtitleMatch = rest.match(SUBTITLE);
  if (subtitleMatch) {
    subtitle = htmlToPlainText(subtitleMatch[1]);
    rest = rest.slice(subtitleMatch[0].length);
  }

  let epigraph: BookChapterOpener["epigraph"] = null;
  const epigraphMatch = rest.match(EPIGRAPH);
  if (epigraphMatch) {
    epigraph = { text: htmlToPlainText(epigraphMatch[1]), reference: htmlToPlainText(epigraphMatch[2]) };
    rest = rest.slice(epigraphMatch[0].length);
  }

  return { part, title, subtitle, epigraph, bodyHtml: rest.trim() };
}

export type BookLessonLabel =
  | { kind: "chapter"; number: number; label: string; title: string }
  | { kind: "epilogue"; label: string; title: string }
  | { kind: "introduction"; label: string; title: string };

/** "Chapter 1: Where Most Men Actually Live", "Epilogue: From Dust to Glory", "Introduction". */
export function parseBookLessonTitle(title: string): BookLessonLabel | null {
  const trimmed = title.trim();
  const chapter = trimmed.match(/^Chapter (\d{1,3}):\s*(.+)$/);
  if (chapter) return { kind: "chapter", number: Number(chapter[1]), label: `Chapter ${chapter[1]}`, title: chapter[2]!.trim() };
  const epilogue = trimmed.match(/^Epilogue:\s*(.+)$/);
  if (epilogue) return { kind: "epilogue", label: "Epilogue", title: epilogue[1]!.trim() };
  if (/^introduction$/i.test(trimmed)) return { kind: "introduction", label: "Introduction", title: "Introduction" };
  return null;
}

/** The SQL pattern that pulls a chapter's Part out of its stored opener (see the lesson page). */
export const BOOK_PART_SQL_PATTERN = "^<p><strong>(Part [^<]{1,120})</strong></p>";
