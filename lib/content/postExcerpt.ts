import { htmlToPlainText } from "./plainText";

const MAX = 180;

/**
 * One line to show under a post's title on the blog listing: its first
 * paragraph as plain text, cut at a word near 180 characters (staging audit,
 * 2026-11-13: the listing showed only titles and dates). Rendered as text, so
 * nothing in it is treated as HTML.
 */
export function postExcerpt(bodyHtml: string): string {
  const first = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(bodyHtml)?.[1] ?? "";
  const text = htmlToPlainText(first).replace(/\s+/g, " ").trim();
  if (text.length <= MAX) return text;
  const cut = text.slice(0, MAX);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:.\s]+$/, "")}…`;
}
