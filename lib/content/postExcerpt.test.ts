import { describe, expect, it } from "vitest";
import { postExcerpt } from "./postExcerpt";

describe("postExcerpt", () => {
  it("takes the first paragraph as plain text", () => {
    expect(postExcerpt("<p><em>It began at a table.</em></p><p>Second.</p>")).toBe("It began at a table.");
  });

  it("shortens a long paragraph at a word", () => {
    const long = `<p>${"word ".repeat(60)}</p>`;
    const out = postExcerpt(long);
    expect(out.length).toBeLessThanOrEqual(181);
    expect(out.endsWith("word…")).toBe(true);
  });

  it("is empty for a body with no paragraph", () => {
    expect(postExcerpt("<h2>Only a heading</h2>")).toBe("");
  });
});
