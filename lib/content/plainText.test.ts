import { describe, expect, it } from "vitest";
import { htmlToPlainText } from "./plainText";

describe("htmlToPlainText", () => {
  it("strips tags and decodes named and numeric entities", () => {
    expect(htmlToPlainText("<p>Grace &amp; <strong>peace</strong>&#39;s &#x2014; hope</p>")).toBe("Grace & peace's — hope");
  });

  it("collapses whitespace and handles empty input", () => {
    expect(htmlToPlainText("<p>a</p>\n<p>b</p>")).toBe("a b");
    expect(htmlToPlainText(null)).toBe("");
  });

  it("leaves an unknown entity as written", () => {
    expect(htmlToPlainText("a &bogus; b")).toBe("a &bogus; b");
  });
});
