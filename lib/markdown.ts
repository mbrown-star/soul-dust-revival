import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

/**
 * Converts a blog post's stored markdown to safe HTML. Sanitized with
 * DOMPurify, same as lesson rich-text content (see SECURITY.md) — markdown
 * source is only ever written by an admin today, but sanitizing at render
 * time costs nothing and doesn't depend on that assumption holding forever.
 */
export function renderMarkdown(markdown: string): string {
  const html = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(html);
}
