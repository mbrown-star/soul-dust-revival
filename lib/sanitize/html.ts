import sanitizeHtmlLib from "sanitize-html";

// `isomorphic-dompurify` (the previous dependency here) pulls in `jsdom`,
// which isn't Workers-compatible -- it tries to read a real file
// (`/browser/default-stylesheet.css`) off a filesystem the Workers runtime
// doesn't have, crashing every request that actually calls `.sanitize()`
// (silent until a real deploy reaches this code path; invisible in local
// Node dev/test, which does have a filesystem).
//
// Tried swapping in `dompurify` with a pure-JS DOM shim instead (`linkedom`,
// then `happy-dom`) -- both looked fine at a glance but, verified by hand
// with a `<script>`/`onerror` payload, both left dangerous markup in the
// output: linkedom's `document` doesn't implement
// `implementation.createHTMLDocument`, which trips DOMPurify's own
// `isSupported` check and makes it silently return input *unsanitized*;
// happy-dom passed that check but still didn't strip `on*` event-handler
// attributes. Both are silent, not crashes -- a far worse failure mode than
// the jsdom crash this is replacing. `sanitize-html` instead parses HTML
// directly (no DOM at all), so it has no such shim-compatibility surface,
// and works identically on Workers, in local dev, and in vitest.
//
// The allowlist below matches what the admin rich-text editor
// (components/admin/RichTextEditor.tsx, Tiptap's StarterKit + Image
// extensions) can actually produce. Never widen this without checking the
// editor's own extension list -- an allowed tag/attribute here that the
// editor can't produce is a dead allowance; one the editor can produce that
// *isn't* here gets silently stripped from saved content.
const ALLOWED_TAGS = [
  "p", "br", "hr",
  "strong", "b", "em", "i", "u", "s", "strike",
  "code", "pre",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote",
  "a", "img",
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ["href", "rel", "target"],
  img: ["src", "alt", "title", "width", "height"],
};

export function sanitizeHtml(html: string): string {
  return sanitizeHtmlLib(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    // Blocks `javascript:`/`data:` URLs in href/src -- the two schemes
    // actually needed are http(s) links and http(s)-hosted images (this
    // app's uploads always go through R2, never a data: URI).
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    disallowedTagsMode: "discard",
  });
}
