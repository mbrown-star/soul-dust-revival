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

  // Regression: the admin rich-text editor saves HTML with no newlines
  // between paragraphs and writes its "Heading" button as <h2>; the parser
  // used to split only on newlines, so any edit made in the admin collapsed
  // the whole day into one unrecognized paragraph.
  it("parses a day as saved by the admin rich-text editor (no newlines, <h2> headings)", () => {
    const html = DAY_1_HTML.split("\n")
      .join("")
      .replace("<p><strong>LIFT UP YOUR EYES</strong></p>", "<h2>Lift Up Your Eyes</h2>");

    const parsed = parseDevotionalHtml(html);

    expect(parsed.title).toBe("Two Trees, Two Soils");
    expect(parsed.keyVerseCitation).toBe("— PSALM 1:3");
    expect(parsed.bodyParagraphs).toHaveLength(2);
    expect(parsed.liftUpParagraphs).toEqual(["One Tree drank the stream fully and never withered."]);
    expect(parsed.questionParagraphs).toHaveLength(1);
  });

  // The reader renders these as plain text, so inline formatting from the
  // rich-text editor must not show up as literal tags or entities.
  it("returns plain text for paragraphs that contain inline formatting or entities", () => {
    const html = "<p><strong>Title</strong></p><p>Grace <strong>and</strong> peace &amp; <a href=\"https://example.com\">hope</a>&#39;s</p>";
    const parsed = parseDevotionalHtml(html);
    expect(parsed.bodyParagraphs).toEqual(["Grace and peace & hope's"]);
  });

  it("keeps bullet-list items as their own paragraphs instead of dropping them", () => {
    const html = "<p><strong>Title</strong></p><p>Intro.</p><ul><li><p>First</p></li><li>Second</li></ul><blockquote><p>Quoted</p></blockquote>";
    expect(parseDevotionalHtml(html).bodyParagraphs).toEqual(["Intro.", "First", "Second", "Quoted"]);
  });

  it("handles a day with no title at all without throwing", () => {
    const parsed = parseDevotionalHtml("<p>Just prose, nothing special.</p>");
    expect(parsed.title).toBe("");
    expect(parsed.bodyParagraphs).toEqual(["Just prose, nothing special."]);
  });
});
