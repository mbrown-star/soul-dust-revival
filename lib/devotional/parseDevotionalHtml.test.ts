import { describe, expect, it } from "vitest";
import { parseDevotionalHtml } from "./parseDevotionalHtml";

const DAY_1_HTML = [
  "<p><strong>Two Trees, Two Soils</strong></p>",
  "<p>“He will be like a tree planted by the streams of water, that produces its fruit in its season, whose leaf also does not wither.”</p>",
  "<p><strong>— PSALM 1:3</strong></p>",
  "<p>Psalm 1 opens the whole songbook with two people and two kinds of ground.</p>",
  "<p>That is where this year starts — with what you are.</p>",
  "<p><strong>LIFT UP YOUR EYES</strong></p>",
  "<p>One Tree drank the stream fully and never withered.</p>",
  "<p><strong>A QUESTION TO SIT WITH</strong></p>",
  "<p>Where are you straining to make yourself green, instead of letting Christ keep you planted by the water?</p>",
].join("\n");

describe("parseDevotionalHtml", () => {
  it("splits a real devotional day into its printed parts", () => {
    const parsed = parseDevotionalHtml(DAY_1_HTML);

    expect(parsed.title).toBe("Two Trees, Two Soils");
    expect(parsed.keyVerseQuote).toContain("He will be like a tree planted");
    expect(parsed.keyVerseCitation).toBe("— PSALM 1:3");
    expect(parsed.bodyParagraphs).toEqual([
      "Psalm 1 opens the whole songbook with two people and two kinds of ground.",
      "That is where this year starts — with what you are.",
    ]);
    expect(parsed.liftUpParagraphs).toEqual(["One Tree drank the stream fully and never withered."]);
    expect(parsed.questionParagraphs).toEqual([
      "Where are you straining to make yourself green, instead of letting Christ keep you planted by the water?",
    ]);
  });

  it("recognizes a citation stored as a plain paragraph, not just a bolded heading (older, unreprocessed imports)", () => {
    const html = [
      "<p><strong>Two Trees, Two Soils</strong></p>",
      "<p>“He will be like a tree planted by the streams of water.”</p>",
      "<p>— PSALM 1:3</p>",
      "<p>Psalm 1 opens the whole songbook with two people and two kinds of ground.</p>",
    ].join("\n");

    const parsed = parseDevotionalHtml(html);

    expect(parsed.keyVerseCitation).toBe("— PSALM 1:3");
    expect(parsed.bodyParagraphs).toEqual([
      "Psalm 1 opens the whole songbook with two people and two kinds of ground.",
    ]);
  });

  it("falls back to body paragraphs for a day that doesn't follow the usual shape", () => {
    const html = ["<p><strong>A Hand-Edited Day</strong></p>", "<p>Just one plain paragraph, no quote, no headings.</p>"].join(
      "\n"
    );

    const parsed = parseDevotionalHtml(html);

    expect(parsed.title).toBe("A Hand-Edited Day");
    expect(parsed.keyVerseQuote).toBeNull();
    expect(parsed.bodyParagraphs).toEqual(["Just one plain paragraph, no quote, no headings."]);
  });

  it("handles a day with no title at all without throwing", () => {
    const parsed = parseDevotionalHtml("<p>Just prose, nothing special.</p>");
    expect(parsed.title).toBe("");
    expect(parsed.bodyParagraphs).toEqual(["Just prose, nothing special."]);
  });
});
