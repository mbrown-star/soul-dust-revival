import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "./html";

// Regression coverage for a real incident: the previous DOMPurify-based
// swaps (first linkedom, then happy-dom) both passed typecheck and the
// existing test suite untouched while silently no-op'ing on dangerous
// input -- nothing asserted on sanitize() actually removing anything. See
// html.ts's comment for the full story.
describe("sanitizeHtml", () => {
  it("strips script tags and their content", () => {
    expect(sanitizeHtml("<p>Hello <script>alert(1)</script>world</p>")).not.toContain("script");
    expect(sanitizeHtml("<script>alert(1)</script>")).not.toContain("alert(1)");
  });

  it("strips event-handler attributes", () => {
    const out = sanitizeHtml('<img src="x" onerror="alert(1)">');
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("alert(1)");
  });

  it("strips onclick from an otherwise-allowed tag", () => {
    const out = sanitizeHtml('<p onclick="alert(1)">hi</p>');
    expect(out).not.toContain("onclick");
    expect(out).toContain("hi");
  });

  it("strips javascript: URLs from links", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain("javascript:");
  });

  it("strips data: URLs from images", () => {
    const out = sanitizeHtml('<img src="data:text/html,<script>alert(1)</script>">');
    expect(out).not.toContain("data:");
    expect(out).not.toContain("script");
  });

  it("strips tags outside the editor's allowlist (e.g. svg)", () => {
    const out = sanitizeHtml("<svg onload=\"alert(1)\"><script>alert(2)</script></svg>");
    expect(out).not.toContain("svg");
    expect(out).not.toContain("alert");
  });

  it("preserves legitimate rich-text content the admin editor produces", () => {
    const out = sanitizeHtml(
      '<p>Normal <strong>bold</strong> and <a href="https://example.com">a link</a> and <img src="https://r2.example.com/x.png" alt="pic"></p>'
    );
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('src="https://r2.example.com/x.png"');
    expect(out).toContain('alt="pic"');
  });

  it("preserves headings and lists", () => {
    const out = sanitizeHtml("<h2>Title</h2><ul><li>one</li><li>two</li></ul>");
    expect(out).toBe("<h2>Title</h2><ul><li>one</li><li>two</li></ul>");
  });
});
