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

describe("parseDevotionalHtml, a day that opens with its readings", () => {
  const JOURNEY_DAY = [
    "<p><strong>GENESIS 1–2 · MATTHEW 1:1–12 · PSALM 1</strong></p>",
    "<p><strong>In the Beginning</strong></p>",
    "<p>“In the beginning, God created the heavens and the earth” (Genesis 1:1). Three openings.</p>",
    "<p>Psalm 1 shows you what a life looks like.</p>",
    "<p><strong>LIFT UP YOUR EYES</strong></p>",
    "<p>Lift your eyes to Christ.</p>",
    "<p><strong>A PRAYER TO BEGIN</strong></p>",
    "<p>Father, You formed me from the dust.</p>",
    "<p>Amen.</p>",
  ].join("\n");

  it("splits out the readings, title, body, Lift Up and the closing prayer", () => {
    const parsed = parseDevotionalHtml(JOURNEY_DAY);
    expect(parsed.readings).toBe("GENESIS 1–2 · MATTHEW 1:1–12 · PSALM 1");
    expect(parsed.title).toBe("In the Beginning");
    expect(parsed.keyVerseQuote).toBeNull();
    expect(parsed.bodyParagraphs).toEqual([
      "“In the beginning, God created the heavens and the earth” (Genesis 1:1). Three openings.",
      "Psalm 1 shows you what a life looks like.",
    ]);
    expect(parsed.liftUpParagraphs).toEqual(["Lift your eyes to Christ."]);
    expect(parsed.prayerHeading).toBe("A Prayer to Begin");
    expect(parsed.prayerParagraphs).toEqual(["Father, You formed me from the dust.", "Amen."]);
  });

  it("keeps a plain 'A PRAYER' heading as printed, in title case", () => {
    const parsed = parseDevotionalHtml(JOURNEY_DAY.replace("A PRAYER TO BEGIN", "A PRAYER"));
    expect(parsed.prayerHeading).toBe("A Prayer");
  });

  it("never takes a day's own label for its readings", () => {
    const parsed = parseDevotionalHtml("<p><strong>DAY 1 · JANUARY 1 · PSALM 1</strong></p>\n<p>“A key verse.”</p>");
    expect(parsed.readings).toBeNull();
    expect(parsed.title).toBe("DAY 1 · JANUARY 1 · PSALM 1");
    expect(parsed.keyVerseQuote).toBe("“A key verse.”");
  });

  it("leaves a Psalms day without readings", () => {
    expect(parseDevotionalHtml(DAY_1_HTML).readings).toBeNull();
    expect(parseDevotionalHtml(DAY_1_HTML).prayerParagraphs).toEqual([]);
  });
});

// Staging audit 2026-11-13: 35 devotional days had a quotation's citation
// in a paragraph of its own (Journey Day 9).
describe("parseDevotionalHtml, a citation split from its quotation", () => {
  const SPLIT_DAY = [
    "<p><strong>GENESIS 17–18 · MATTHEW 6:18–34 · PSALM 9</strong></p>",
    "<p><strong>Is Anything Too Hard?</strong></p>",
    "<p>God asks, “Is anything too hard for Yahweh?”</p>",
    "<p>(Genesis 18:14). A year later the tired laugh becomes a real one.</p>",
    "<p>(This aside is not a citation.)</p>",
    "<p><strong>LIFT UP YOUR EYES</strong></p>",
    "<p>Jesus asks, “Where is your faith?”</p>",
    "<p>(Luke 8:25).</p>",
  ].join("\n");

  it("joins the citation back onto the quotation, in any section", () => {
    const parsed = parseDevotionalHtml(SPLIT_DAY);
    expect(parsed.bodyParagraphs).toEqual([
      "God asks, “Is anything too hard for Yahweh?” (Genesis 18:14). A year later the tired laugh becomes a real one.",
      "(This aside is not a citation.)",
    ]);
    expect(parsed.liftUpParagraphs).toEqual(["Jesus asks, “Where is your faith?” (Luke 8:25)."]);
  });
});
