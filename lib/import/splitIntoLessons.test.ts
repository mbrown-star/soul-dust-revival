import { describe, expect, it } from "vitest";
import { splitHtmlByHeadings, splitPlainTextByHeadings, splitStudyPlainTextByHeadings } from "./splitIntoLessons";

describe("splitHtmlByHeadings", () => {
  it("splits on h1/h2 boundaries using their own text as the title", () => {
    const html = "<h1>Week 1</h1><p>First content.</p><h2>Week 2</h2><p>Second content.</p>";
    const lessons = splitHtmlByHeadings(html);
    expect(lessons).toHaveLength(2);
    expect(lessons[0]).toEqual({ title: "Week 1", bodyHtml: "<p>First content.</p>" });
    expect(lessons[1]).toEqual({ title: "Week 2", bodyHtml: "<p>Second content.</p>" });
  });

  it("treats the whole document as one lesson when there are no headings", () => {
    const html = "<p>Just a paragraph, no headings at all.</p>";
    const lessons = splitHtmlByHeadings(html);
    expect(lessons).toEqual([{ title: "Imported Content", bodyHtml: html }]);
  });
});

describe("splitPlainTextByHeadings", () => {
  it("falls back to the keyword heuristic when no table of contents is present", () => {
    const text = ["Week 1", "First week's content.", "", "Week 2", "Second week's content."].join("\n");
    const lessons = splitPlainTextByHeadings(text);
    expect(lessons).toHaveLength(2);
    expect(lessons[0]!.title).toBe("Week 1");
    expect(lessons[0]!.bodyHtml).toContain("First week");
    expect(lessons[1]!.title).toBe("Week 2");
  });

  it("recognizes \"Day N\" as a heading (a 365-day devotional, not just Week/Lesson/Session/Chapter/Part)", () => {
    const text = ["Day 1", "Reflect on the dust.", "", "Day 2", "Reflect on revival."].join("\n");
    const lessons = splitPlainTextByHeadings(text);
    expect(lessons).toHaveLength(2);
    expect(lessons[0]!.title).toBe("Day 1");
    expect(lessons[1]!.title).toBe("Day 2");
  });

  it("treats the whole document as a single Introduction lesson when nothing heading-shaped is found at all", () => {
    const text = "Just some plain prose with no structure whatsoever.";
    const lessons = splitPlainTextByHeadings(text);
    expect(lessons).toEqual([
      { title: "Introduction", bodyHtml: "<p>Just some plain prose with no structure whatsoever.</p>" },
    ]);
  });

  it("treats a truly empty document as a single empty lesson rather than finding no sections at all", () => {
    const lessons = splitPlainTextByHeadings("   \n  \n");
    expect(lessons).toEqual([{ title: "Imported Content", bodyHtml: "" }]);
  });

  it("uses a Table of Contents (with dot-leader page numbers) as the authoritative lesson list", () => {
    const text = [
      "Table of Contents",
      "Day 1: Trusting the Dust ............ 5",
      "Day 2: Formed Again .................. 9",
      "Day 3: A Quiet Revival ............... 13",
      "",
      "Day 1: Trusting the Dust",
      "My soul cleaves to the dust.",
      "Reflect on what it means to feel worn down.",
      "",
      "Day 2: Formed Again",
      "Consider what it means to be re-formed.",
      "",
      "Day 3: A Quiet Revival",
      "A final word on revival.",
    ].join("\n");

    const lessons = splitPlainTextByHeadings(text);

    expect(lessons).toHaveLength(3);
    expect(lessons[0]!.title).toBe("Day 1: Trusting the Dust");
    expect(lessons[0]!.bodyHtml).toContain("My soul cleaves to the dust.");
    expect(lessons[0]!.bodyHtml).not.toContain("Trusting the Dust ............"); // the TOC line itself isn't duplicated into a lesson body
    expect(lessons[1]!.title).toBe("Day 2: Formed Again");
    expect(lessons[1]!.bodyHtml).toContain("re-formed");
    expect(lessons[2]!.title).toBe("Day 3: A Quiet Revival");
    expect(lessons[2]!.bodyHtml).toContain("A final word on revival.");
  });

  it("matches a TOC entry's body heading by its leading label even when the body doesn't repeat the full subtitle", () => {
    const text = [
      "Table of Contents",
      "Day 1: Trusting the Dust ............ 5",
      "Day 2: Formed Again .................. 9",
      "",
      "Day 1", // body heading omits the TOC's ": Trusting the Dust" subtitle
      "Content for day one.",
      "",
      "Day 2",
      "Content for day two.",
    ].join("\n");

    const lessons = splitPlainTextByHeadings(text);

    expect(lessons).toHaveLength(2);
    // The lesson title comes from the TOC entry (the fuller, more useful
    // title), even though the body heading it was matched against was bare.
    expect(lessons[0]!.title).toBe("Day 1: Trusting the Dust");
    expect(lessons[0]!.bodyHtml).toContain("Content for day one.");
    expect(lessons[1]!.title).toBe("Day 2: Formed Again");
  });

  it("falls back to the keyword heuristic when a \"Contents\" heading exists but fewer than 2 real entries follow it", () => {
    const text = [
      "Table of Contents",
      "(see the back cover for a printable version)",
      "",
      "Week 1",
      "Actual content starts here.",
    ].join("\n");

    const lessons = splitPlainTextByHeadings(text);
    // Fewer than 2 TOC-shaped entries means this was never treated as a real
    // TOC at all, so the keyword fallback runs on the whole document as-is
    // (unchanged pre-existing behavior) -- the "Contents" line and the
    // non-entry line under it become a leading Introduction section, same
    // as any other content before the first real heading would.
    expect(lessons).toHaveLength(2);
    expect(lessons[0]!.title).toBe("Introduction");
    expect(lessons[1]!.title).toBe("Week 1");
    expect(lessons[1]!.bodyHtml).toContain("Actual content starts here.");
  });

  it("skips the whole detected TOC block (not just individual entries) when falling back, so its own dot-leader lines aren't mistaken for headings", () => {
    const text = [
      "Table of Contents",
      "Day 1: Trusting the Dust ............ 5",
      "Day 2: Formed Again .................. 9",
      "",
      // Body never actually repeats "Day 1"/"Day 2" as its own heading line
      // (e.g. a PDF whose extracted text order doesn't match reading order).
      "Some unrelated preface text.",
      "Week 1",
      "Real content under a totally different heading style.",
    ].join("\n");

    const lessons = splitPlainTextByHeadings(text);
    // Without skipping the TOC block first, the keyword fallback would see
    // "Day 1: ... 5" and "Day 2: ... 9" as two more (spurious) headings,
    // since each still starts with a recognized label.
    expect(lessons).toHaveLength(2);
    expect(lessons[0]!.title).toBe("Introduction");
    expect(lessons[0]!.bodyHtml).toContain("Some unrelated preface text.");
    expect(lessons[1]!.title).toBe("Week 1");
    expect(lessons[1]!.bodyHtml).toContain("Real content under a totally different heading style.");
  });

  it("splits consecutive sentence-ending lines into separate paragraphs instead of merging the whole section into one", () => {
    const text = [
      "Day 1",
      "My soul cleaves to the dust.",
      "Reflect on what it means to feel worn down.",
      "Revive me according to Your word.",
    ].join("\n");

    const lessons = splitPlainTextByHeadings(text);

    expect(lessons).toHaveLength(1);
    expect(lessons[0]!.bodyHtml).toBe(
      [
        "<p>My soul cleaves to the dust.</p>",
        "<p>Reflect on what it means to feel worn down.</p>",
        "<p>Revive me according to Your word.</p>",
      ].join("\n")
    );
  });

  it("keeps a short, heading-shaped line as its own bolded paragraph instead of folding it into the surrounding prose", () => {
    const text = ["Day 1", "A Question To Sit With", "Where are you planted this year?"].join("\n");

    const lessons = splitPlainTextByHeadings(text);

    expect(lessons).toHaveLength(1);
    expect(lessons[0]!.bodyHtml).toBe(
      ["<p><strong>A Question To Sit With</strong></p>", "<p>Where are you planted this year?</p>"].join("\n")
    );
  });
});

describe("splitStudyPlainTextByHeadings", () => {
  function buildWeek(n: number, title: string, verseRef: string, question: string, greekWord: string): string[] {
    return [
      `${"I".repeat(n)}WEEK ${n}`,
      title,
      "from dust to somewhere",
      "◆",
      `“A quoted verse for week ${n}.”`,
      verseRef,
      "READ · REFLECT · RETURN",
      "SCRIPTURE STUDY · DIVE",
      title,
      "Some essay content for this week.",
      verseRef,
      `“A quoted verse for week ${n}.”`,
      "QUESTION",
      question,
      "GOING DEEPER · THE GREEK",
      greekWord,
      "a transliteration and gloss",
      `${verseRef}; OTHER 1:1`,
      "An explanatory paragraph about the word.",
      "LIVE IT: Do something about it this week.",
    ];
  }

  it("splits a Study document into one lesson per week using its own WEEK heading, discarding a Contents listing's duplicate heading for the same week", () => {
    const text = [
      "Contents",
      "First Week Title",
      "WEEK 1 · Book 1:1-8 · from dust to somewhere 11",
      "Second Week Title",
      "WEEK 2 · Book 1:9-14 · from dust to somewhere else 26",
      "",
      ...buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις"),
      ...buildWeek(2, "Second Week Title", "BOOK 1:9-14", "Am I resting or earning?", "πίστις"),
    ].join("\n");

    const lessons = splitStudyPlainTextByHeadings(text);

    // The Contents page's own "WEEK 1 · ..."/"WEEK 2 · ..." entries also
    // match the heading pattern -- taking only the LAST occurrence of each
    // week number (see this function's own doc comment) is what keeps them
    // from being mistaken for a second, duplicate set of real weeks. The
    // Contents text itself isn't specially recognized and so isn't
    // discarded outright -- it's harmlessly folded into a leading
    // "Introduction" lesson, same as any other front matter.
    expect(lessons).toHaveLength(3);
    expect(lessons[0]!.title).toBe("Introduction");
    expect(lessons[1]!.title).toBe("Week 1: First Week Title");
    expect(lessons[2]!.title).toBe("Week 2: Second Week Title");
  });

  it("extracts a QUESTION section as its own input block, not folded into reading text", () => {
    const text = buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις").join("\n");

    const lessons = splitStudyPlainTextByHeadings(text);

    const questionBlocks = lessons[0]!.blocks.filter((b) => b.type === "question");
    expect(questionBlocks).toHaveLength(1);
    expect(questionBlocks[0]).toMatchObject({ type: "question", questionPrompt: "Am I trusting or striving?" });
  });

  it("extracts a QUESTION label's own text as the question block's prompt when it's inline rather than on its own line", () => {
    const text = [
      ...buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις"),
      "BOOK 1:5-6",
      "QUESTION Where in your life right now are you leaning on your own strength instead of resting in grace?",
    ].join("\n");

    const lessons = splitStudyPlainTextByHeadings(text);

    const questionBlocks = lessons[0]!.blocks.filter((b) => b.type === "question");
    expect(questionBlocks).toHaveLength(2);
    expect(questionBlocks[1]).toMatchObject({
      type: "question",
      questionPrompt: "Where in your life right now are you leaning on your own strength instead of resting in grace?",
    });
  });

  it("does not mistake a word that merely starts with 'Question' for the QUESTION label", () => {
    const text = [
      ...buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις"),
      "Questionable content never earns a place in this study.",
    ].join("\n");

    const lessons = splitStudyPlainTextByHeadings(text);

    const questionBlocks = lessons[0]!.blocks.filter((b) => b.type === "question");
    // Only the one real "QUESTION" block from buildWeek -- "Questionable"
    // must stay ordinary reading text, not be read as a second question.
    expect(questionBlocks).toHaveLength(1);
    const allBodyHtml = lessons[0]!.blocks
      .map((b) => (b.type === "callout" || b.type === "text" ? b.bodyHtml : ""))
      .join("");
    expect(allBodyHtml).toContain("Questionable content");
  });

  it("recognizes a numbered-book verse reference (e.g. '1 JOHN 1:9') as a section boundary", () => {
    const text = [
      ...buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις"),
      "1 JOHN 1:9",
      "If we confess our sins, he is faithful to forgive us.",
      "QUESTION",
      "Am I confessing specifics or only vague generalities?",
    ].join("\n");

    const lessons = splitStudyPlainTextByHeadings(text);

    const callout = lessons[0]!.blocks.find((b) => b.type === "callout");
    expect(callout?.type).toBe("callout");
    if (callout?.type === "callout") {
      // The numbered-book reference must end the callout, not be folded
      // into its body as if it were unrecognized ordinary text.
      expect(callout.bodyHtml).not.toContain("If we confess our sins");
    }
    const questionBlocks = lessons[0]!.blocks.filter((b) => b.type === "question");
    expect(questionBlocks).toHaveLength(2);
    expect(questionBlocks[1]).toMatchObject({
      type: "question",
      questionPrompt: "Am I confessing specifics or only vague generalities?",
    });
  });

  it("extracts a Going Deeper section as a callout block with the studied word as its title", () => {
    const text = buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις").join("\n");

    const lessons = splitStudyPlainTextByHeadings(text);

    const calloutBlocks = lessons[0]!.blocks.filter((b) => b.type === "callout");
    expect(calloutBlocks).toHaveLength(1);
    expect(calloutBlocks[0]).toMatchObject({ type: "callout", calloutTitle: "χάρις" });
    if (calloutBlocks[0]!.type === "callout") {
      expect(calloutBlocks[0]!.bodyHtml).toContain("An explanatory paragraph about the word.");
      expect(calloutBlocks[0]!.bodyHtml).toContain("LIVE IT");
    }
  });

  it("does not treat a multi-reference citation list (with a semicolon) as a section boundary that cuts off a callout early", () => {
    const text = buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις").join("\n");

    const lessons = splitStudyPlainTextByHeadings(text);

    const callout = lessons[0]!.blocks.find((b) => b.type === "callout");
    expect(callout?.type).toBe("callout");
    if (callout?.type === "callout") {
      // "BOOK 1:1-8; OTHER 1:1" is a reference list, not a new heading -- it
      // must stay inside the callout body, not truncate it right after the
      // Greek word and gloss.
      expect(callout.bodyHtml).toContain("explanatory paragraph");
    }
  });

  it("does not treat a reflection-only question (no literal 'QUESTION' label) as an input block", () => {
    const text = [
      ...buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις"),
      "BOOK 1:5-6",
      "QUIET QUESTION TO CARRY",
      "What have you been staking your hope on?",
    ].join("\n");

    const lessons = splitStudyPlainTextByHeadings(text);

    const questionBlocks = lessons[0]!.blocks.filter((b) => b.type === "question");
    // Only the one real "QUESTION" block from buildWeek -- "QUIET QUESTION TO
    // CARRY" reads like the Devotional's own reflection prompts (meant to be
    // pondered, not typed into a saved field) and must not become a second one.
    expect(questionBlocks).toHaveLength(1);
  });

  it("puts content before the first WEEK heading into a leading Introduction lesson", () => {
    const text = [
      "A Word Before the First Page",
      "Some foreword content.",
      ...buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις"),
    ].join("\n");

    const lessons = splitStudyPlainTextByHeadings(text);

    expect(lessons[0]!.title).toBe("Introduction");
    expect(lessons[1]!.title).toBe("Week 1: First Week Title");
  });

  it("treats the whole document as a single lesson when no WEEK heading is found at all", () => {
    const text = "Just some plain prose with no week structure whatsoever.";
    const lessons = splitStudyPlainTextByHeadings(text);

    expect(lessons).toHaveLength(1);
    expect(lessons[0]!.title).toBe("Imported Content");
  });
});
