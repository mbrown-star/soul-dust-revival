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
    // -- the "Contents" line and the non-entry line under it have no
    // Foreword/Preface heading of their own, so they're narrowed away to
    // nothing and no Introduction section is produced at all.
    expect(lessons).toHaveLength(1);
    expect(lessons[0]!.title).toBe("Week 1");
    expect(lessons[0]!.bodyHtml).toContain("Actual content starts here.");
  });

  it("skips the whole detected TOC block (not just individual entries) when falling back, so its own dot-leader lines aren't mistaken for headings", () => {
    const text = [
      "Table of Contents",
      "Day 1: Trusting the Dust ............ 5",
      "Day 2: Formed Again .................. 9",
      "",
      // Body never actually repeats "Day 1"/"Day 2" as its own heading line
      // (e.g. a PDF whose extracted text order doesn't match reading order).
      "Preface",
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

  it("narrows the Introduction down to just its Foreword/Preface sections, discarding other front matter", () => {
    const text = [
      "Soul Dust Revival",
      "A Devotional",
      "Copyright 2026 Marketlife Ministries",
      "Foreword",
      "This book began on a dusty road.",
      "Acknowledgments",
      "Thanks to everyone who made this possible.",
      "Preface",
      "Read one day at a time.",
      "Day 1",
      "First day's content.",
    ].join("\n");

    const lessons = splitPlainTextByHeadings(text);

    expect(lessons).toHaveLength(2);
    expect(lessons[0]!.title).toBe("Introduction");
    expect(lessons[0]!.bodyHtml).toContain("This book began on a dusty road.");
    expect(lessons[0]!.bodyHtml).toContain("Read one day at a time.");
    // Everything else before the Foreword, and the Acknowledgments section
    // sitting between Foreword and Preface, are all discarded.
    expect(lessons[0]!.bodyHtml).not.toContain("Copyright");
    expect(lessons[0]!.bodyHtml).not.toContain("Marketlife");
    expect(lessons[0]!.bodyHtml).not.toContain("Thanks to everyone");
    expect(lessons[1]!.title).toBe("Day 1");
  });

  it("stops the Introduction at a 'Before We Begin' essay following the Preface", () => {
    const text = [
      "Soul Dust Revival",
      "A Devotional",
      "Foreword",
      "This book began on a dusty road.",
      "Preface",
      "Read one day at a time.",
      "Before We Begin",
      "The Six Faces of the Dust is a reflective essay about what it means to cling to the dust.",
      "Day 1",
      "First day's content.",
    ].join("\n");

    const lessons = splitPlainTextByHeadings(text);

    expect(lessons).toHaveLength(2);
    expect(lessons[0]!.title).toBe("Introduction");
    expect(lessons[0]!.bodyHtml).toContain("This book began on a dusty road.");
    expect(lessons[0]!.bodyHtml).toContain("Read one day at a time.");
    expect(lessons[0]!.bodyHtml).not.toContain("Before We Begin");
    expect(lessons[0]!.bodyHtml).not.toContain("Six Faces of the Dust");
    expect(lessons[1]!.title).toBe("Day 1");
  });

  it("drops the Introduction lesson entirely when its front matter has no Foreword or Preface at all", () => {
    const text = [
      "Soul Dust Revival",
      "A Devotional",
      "Table of Contents",
      "Day 1",
      "First day's content.",
    ].join("\n");

    const lessons = splitPlainTextByHeadings(text);

    expect(lessons).toHaveLength(1);
    expect(lessons[0]!.title).toBe("Day 1");
  });

  it("doesn't mistake a dot-leader \"Foreword\"/\"Preface\" page reference for the real section, and doesn't truncate a real Foreword at a heading-shaped line within it", () => {
    // REGRESSION: a dot-leader page reference like "Foreword .......... 3"
    // starts with the recognized label too, but it's a page reference, not
    // the section's real start -- and a short, punctuation-free line
    // *inside* the real Foreword's own prose (a pull-quote-style sentence,
    // "Dust Is Not The End") must not be mistaken for a boundary that ends
    // the section early either. No literal "Table of Contents"/"Contents"
    // heading here on purpose -- this fixture is for the keyword-heuristic
    // path specifically (see the TOC-based path's own, separate tests above).
    const text = [
      "Soul Dust Revival",
      "Foreword .......... 3",
      "Preface .......... 5",
      "",
      "Foreword",
      "Dust Is Not The End",
      "This book began on a dusty road, long before the first word was written.",
      "Day 1",
      "First day's content.",
    ].join("\n");

    const lessons = splitPlainTextByHeadings(text);

    expect(lessons).toHaveLength(2);
    expect(lessons[0]!.title).toBe("Introduction");
    // The real Foreword's own content, including the pull-quote-style line
    // partway through it, all survives...
    expect(lessons[0]!.bodyHtml).toContain("Dust Is Not The End");
    expect(lessons[0]!.bodyHtml).toContain("This book began on a dusty road");
    // ...but the dot-leader page references for Foreword/Preface never
    // leaked in as if they were real section content.
    expect(lessons[0]!.bodyHtml).not.toContain("..........");
    expect(lessons[1]!.title).toBe("Day 1");
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

describe("splitPlainTextByHeadings, a day-by-day devotional", () => {
  it("splits only on its main label, so a paragraph starting 'Chapter 12 ...' stays in its day", () => {
    const text = [
      "FOREWORD",
      "A word before the first page.",
      "TWELVE MONTHS · 365 DAYS",
      "DAY 1 · JANUARY 1",
      "GENESIS 1–2 · MATTHEW 1 · PSALM 1",
      "In the beginning God created.",
      "Chapter 2 slows down and kneels in the dust.",
      "DAY 2 · JANUARY 2",
      "GENESIS 3–4 · MATTHEW 2 · PSALM 2",
      "The serpent speaks.",
      "DAY 3 · JANUARY 3",
      "GENESIS 5–6 · MATTHEW 3 · PSALM 3",
      "The flood.",
    ].join("\n");

    const lessons = splitPlainTextByHeadings(text);
    expect(lessons.map((l) => l.title)).toEqual(["Introduction", "DAY 1 · JANUARY 1", "DAY 2 · JANUARY 2", "DAY 3 · JANUARY 3"]);
    expect(lessons[1]!.bodyHtml).toContain("kneels in the dust");
    expect(lessons[0]!.bodyHtml).not.toContain("TWELVE MONTHS");
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
    // Contents text itself has no Foreword/Preface heading of its own, so
    // it's narrowed away to nothing and no Introduction lesson is produced
    // at all (see narrowToForewordAndPreface).
    expect(lessons).toHaveLength(2);
    expect(lessons[0]!.title).toBe("Week 1: First Week Title");
    expect(lessons[1]!.title).toBe("Week 2: Second Week Title");
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

  it("puts a Foreword/Preface found before the first WEEK heading into a leading Introduction lesson", () => {
    const text = [
      "Foreword",
      "Some foreword content.",
      ...buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις"),
    ].join("\n");

    const lessons = splitStudyPlainTextByHeadings(text);

    expect(lessons[0]!.title).toBe("Introduction");
    expect(lessons[1]!.title).toBe("Week 1: First Week Title");
  });

  it("narrows a Study document's Introduction down to just its Foreword/Preface sections, discarding the title page and a Contents duplicate", () => {
    const text = [
      "Marketlife Ministries",
      "Soul Dust Revival",
      "A Study Of",
      "Colossians",
      "Contents",
      "Week 1 · Title 5",
      "Foreword",
      "A word from the author before the study begins.",
      "Preface",
      "How to use this study.",
      ...buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις"),
    ].join("\n");

    const lessons = splitStudyPlainTextByHeadings(text);

    expect(lessons).toHaveLength(2);
    expect(lessons[0]!.title).toBe("Introduction");
    const introText = lessons[0]!.blocks.map((b) => (b.type === "text" ? b.bodyHtml : "")).join("\n");
    expect(introText).toContain("A word from the author before the study begins.");
    expect(introText).toContain("How to use this study.");
    expect(introText).not.toContain("Marketlife");
    expect(introText).not.toContain("Colossians");
    expect(introText).not.toContain("Contents");
    expect(lessons[1]!.title).toBe("Week 1: First Week Title");
  });

  it("stops the Introduction at a 'Before We Begin' essay following the Preface, instead of keeping it as if it were still Preface content", () => {
    // REGRESSION: the real Colossians document's front matter is Foreword ->
    // Preface -> a "Before We Begin" / "Six Faces of the Dust" essay, with no
    // heading in between Preface and the essay -- before BEFORE_WE_BEGIN was
    // added to FRONT_MATTER_END_HEADING, nothing told narrowToForewordAndPreface
    // to stop keeping, so the whole essay silently rode along as if it were
    // still part of the Preface.
    const text = [
      "Marketlife Ministries",
      "Soul Dust Revival",
      "Foreword",
      "A word from the author before the study begins.",
      "Preface",
      "How to use this study.",
      "Before We Begin",
      "The Six Faces of the Dust is a reflective essay that has nothing to do with the preface.",
      ...buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις"),
    ].join("\n");

    const lessons = splitStudyPlainTextByHeadings(text);

    expect(lessons).toHaveLength(2);
    expect(lessons[0]!.title).toBe("Introduction");
    const introText = lessons[0]!.blocks.map((b) => (b.type === "text" ? b.bodyHtml : "")).join("\n");
    expect(introText).toContain("A word from the author before the study begins.");
    expect(introText).toContain("How to use this study.");
    expect(introText).not.toContain("Before We Begin");
    expect(introText).not.toContain("Six Faces of the Dust");
    expect(lessons[1]!.title).toBe("Week 1: First Week Title");
  });

  it("finds a week title page whose first letter extracted as its own run ('IW EEK 1', from 1 Peter)", () => {
    const week = (n: number, title: string) =>
      buildWeek(n, title, `BOOK ${n}:1-8`, `Question ${n}?`, "λόγος").map((line, i) =>
        i === 0 ? `${"I".repeat(n)}W EEK ${n}` : line
      );
    const text = [
      "Foreword",
      "A word from the author.",
      "TWELVEWEEKSIN BOOK",
      "WEEK 1 · BOOK 1:1–9 · from dust to somewhere 8",
      "WEEK 2 · BOOK 1:10–21 · from dust to somewhere else 24",
      ...week(1, "First Week Title"),
      ...week(2, "Second Week Title"),
    ].join("\n");

    const lessons = splitStudyPlainTextByHeadings(text);

    expect(lessons.map((l) => l.title)).toEqual(["Introduction", "Week 1: First Week Title", "Week 2: Second Week Title"]);
    for (const lesson of lessons.slice(1)) {
      expect(lesson.blocks.filter((b) => b.type === "question")).toHaveLength(1);
      expect(lesson.blocks.filter((b) => b.type === "callout")).toHaveLength(1);
    }
  });

  it("ends the Preface at a 'BEFORE YOU BEGIN' essay or a 'TWELVE WEEKS IN' contents page, spaced or collapsed", () => {
    for (const [beforeYouBegin, contents] of [
      ["BEFORE YOU BEGIN", "TWELVE WEEKS IN GALATIANS"],
      ["BEFOREYOUBEGIN", "TWELVEWEEKSIN 1 PETER"],
      ["BEFORE YOU BEGIN", "TWELVEWEEKSWITHTHEHOLYSPIRIT"],
    ]) {
      const text = [
        "Foreword",
        "A word from the author.",
        "Preface",
        "How to use this study.",
        contents,
        "WEEK 1 · BOOK 1:1–9 · from dust to somewhere 8",
        beforeYouBegin,
        "The Six Faces of the Dust",
        "A reflective essay that is not part of the Preface.",
        ...buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις"),
      ].join("\n");

      const introText = splitStudyPlainTextByHeadings(text)[0]!.blocks.map((b) => (b.type === "text" ? b.bodyHtml : "")).join("\n");
      expect(introText).toContain("How to use this study.");
      expect(introText).not.toContain("Six Faces");
      expect(introText).not.toContain("from dust to somewhere");
    }
  });

  it("ends the last word study at the week's Life Application, so what follows is reading text, not part of the Greek box", () => {
    for (const label of ["LIFE APPLICATION · WEEK 1", "LIFEAPPLICATION · WEEK 1"]) {
      const text = [
        ...buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις"),
        label,
        "Where This Meets Real Life",
        "1. Name the one place you are still striving.",
        "DAILY PRAYER",
        "Father, I come in the dust.",
      ].join("\n");

      const blocks = splitStudyPlainTextByHeadings(text)[0]!.blocks;
      const callout = blocks.find((b) => b.type === "callout");
      expect(callout && callout.type === "callout" ? callout.bodyHtml : "").not.toContain("Real Life");
      const last = blocks.at(-1)!;
      expect(last.type).toBe("text");
      expect(last.type === "text" ? last.bodyHtml : "").toContain("Name the one place you are still striving.");
      expect(last.type === "text" ? last.bodyHtml : "").toContain("Father, I come in the dust.");
    }
  });

  it("doesn't end a word study at an ordinary sentence starting 'Life application'", () => {
    // The sentence sits inside the word study, before its closing LIVE IT line.
    const text = buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις")
      .flatMap((line) => (line.startsWith("LIVE IT:") ? ["Life application begins with naming what you trust.", line] : [line]))
      .join("\n");
    const callout = splitStudyPlainTextByHeadings(text)[0]!.blocks.find((b) => b.type === "callout");
    expect(callout && callout.type === "callout" ? callout.bodyHtml : "").toContain("Life application begins");
  });

  it("starts a new station at a verse reference extracted with spaces around its punctuation ('1 PETER 1 : 18 – 19')", () => {
    const text = [
      ...buildWeek(1, "First Week Title", "1 PETER 1 : 3 – 5", "Where is my hope?", "ἐλπίς"),
      "1 PETER 1 : 18 – 19",
      "“You were redeemed, not with corruptible things.”",
      "QUESTION",
      "What did it cost?",
    ].join("\n");

    const blocks = splitStudyPlainTextByHeadings(text)[0]!.blocks;
    const callout = blocks.find((b) => b.type === "callout");
    expect(callout && callout.type === "callout" ? callout.bodyHtml : "").not.toContain("redeemed");
    expect(blocks.filter((b) => b.type === "question")).toHaveLength(2);
  });

  it("doesn't let a contents entry with a bare page number ('Preface 4') restart the Preface", () => {
    const text = [
      "Foreword",
      "A word from the author.",
      "Preface",
      "How to use this study.",
      "TWELVE WEEKS IN GALATIANS",
      "Contents",
      "A Word Before the First Page 3",
      "Preface 4",
      "The Six Faces of the Dust 7",
      "First Week Title 10",
      ...buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις"),
    ].join("\n");

    const introText = splitStudyPlainTextByHeadings(text)[0]!.blocks.map((b) => (b.type === "text" ? b.bodyHtml : "")).join("\n");
    expect(introText).toContain("How to use this study.");
    expect(introText).not.toContain("Six Faces");
    expect(introText).not.toContain("First Week Title");
  });

  it("starts a new station at a 'PASSAGE N ·' label, so the previous word study doesn't swallow it (The Ten Commandments)", () => {
    const text = [
      ...buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις"),
      "PASSAGE 2 · ROMANS 7 : 7 – 9",
      "7 What shall we say then? Is the law sin?",
      "QUESTION",
      "What has the Law woken up in you?",
    ].join("\n");

    const blocks = splitStudyPlainTextByHeadings(text)[0]!.blocks;
    const callout = blocks.find((b) => b.type === "callout");
    expect(callout && callout.type === "callout" ? callout.bodyHtml : "").not.toContain("Is the law sin");
    expect(blocks.filter((b) => b.type === "question")).toHaveLength(2);
  });

  it("keeps a word study's own source line in ordinary case ('Hebrews 1:3') inside the word study", () => {
    const text = [
      "IWEEK 1",
      "First Week Title",
      "QUESTION",
      "What does it do to you?",
      "GOING DEEPER · THE GREEK",
      "ἀπαύγασμα apaugasma “radiance”",
      "Hebrews 1:3",
      "Apaugasma is the light that streams out from a shining body.",
      "HEBREWS 4 : 14 – 16",
      "14 Having then a great high priest.",
    ].join("\n");

    const blocks = splitStudyPlainTextByHeadings(text)[0]!.blocks;
    const callout = blocks.find((b) => b.type === "callout");
    expect(callout && callout.type === "callout" ? callout.bodyHtml : "").toContain("streams out from a shining body");
    // The capitalised passage heading still starts the next station.
    expect(callout && callout.type === "callout" ? callout.bodyHtml : "").not.toContain("great high priest");
  });

  it("keeps a word study's single-verse source ('JAMES 1:11') inside it, and still ends it at the next passage", () => {
    const text = [
      "IWEEK 1",
      "First Week Title",
      "QUESTION",
      "Where are you fading?",
      "GOING DEEPER · THE GREEK",
      "μαραίνω marainō",
      "— to wither; to fade away",
      "JAMES 1:11",
      "Marainō first meant to quench a fire, and in the passive, of a fire dying down.",
      "LIVE IT: Name what is fading.",
      "JAMES 1:17",
      "Every good gift and every perfect gift is from above.",
      "QUESTION",
      "What gift have you overlooked?",
    ].join("\n");

    const blocks = splitStudyPlainTextByHeadings(text)[0]!.blocks;
    const callout = blocks.find((b) => b.type === "callout");
    const body = callout && callout.type === "callout" ? callout.bodyHtml : "";
    expect(body).toContain("quench a fire");
    expect(body).toContain("Name what is fading.");
    expect(body).not.toContain("Every good gift");
    expect(blocks.filter((b) => b.type === "question")).toHaveLength(2);
  });

  it("ends a word study after its LIVE IT paragraph, so a following pull-quote isn't inside the box", () => {
    const text = [
      "IWEEK 1",
      "First Week Title",
      "QUESTION",
      "Does your smallness make you bold?",
      "GOING DEEPER · THE HEBREW",
      "‘āphār wā’ēpher",
      "— dust and ashes",
      "GENESIS 18:27; JOB 42:6",
      "The phrase pairs the dust of creation with the ashes of mourning.",
      "LIVE IT: Ask God this week for something you have felt too",
      "insignificant to request.",
      "“Abraham stopped at ten. God never said that was the limit.”",
      "GENESIS 18:32",
    ].join("\n");

    const blocks = splitStudyPlainTextByHeadings(text)[0]!.blocks;
    const callout = blocks.find((b) => b.type === "callout");
    const body = callout && callout.type === "callout" ? callout.bodyHtml : "";
    expect(body).toContain("insignificant to request.");
    expect(body).not.toContain("Abraham stopped at ten");
    const last = blocks.at(-1)!;
    expect(last.type === "text" ? last.bodyHtml : "").toContain("Abraham stopped at ten");
  });

  it("starts a new station at a passage reference with a comma list ('GENESIS 18:27, 32')", () => {
    const text = [
      ...buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις"),
      "GENESIS 18:27, 32",
      "Abraham answered, “See now, I am dust and ashes.”",
      "QUESTION",
      "Does my smallness make me bold?",
    ].join("\n");

    const blocks = splitStudyPlainTextByHeadings(text)[0]!.blocks;
    const callout = blocks.find((b) => b.type === "callout");
    expect(callout && callout.type === "callout" ? callout.bodyHtml : "").not.toContain("dust and ashes");
    expect(blocks.filter((b) => b.type === "question")).toHaveLength(2);
  });

  it("doesn't restart the Introduction at a second, contents-style FOREWORD / PREFACE listing", () => {
    const text = [
      "FOREWORD",
      "A word from the author.",
      "PREFACE",
      "How to use this study.",
      "BEFOREYOUBEGIN",
      "The Six Faces of the Dust essay.",
      "Contents",
      "A Word Before the First Page",
      "FOREWORD",
      "The Four Beats of Genesis",
      "PREFACE",
      "Dust, Breath, Fall, Promise",
      "BEFORE YOU BEGIN",
      ...buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις"),
    ].join("\n");

    const introText = splitStudyPlainTextByHeadings(text)[0]!.blocks.map((b) => (b.type === "text" ? b.bodyHtml : "")).join("\n");
    expect(introText).toContain("How to use this study.");
    expect(introText).not.toContain("Four Beats");
    expect(introText).not.toContain("Dust, Breath, Fall, Promise");
  });

  it("joins a week title that wraps onto a second line before its 'from dust' subtitle", () => {
    const text = [
      "IWEEK 1",
      "The Mountain and the Righteousness That",
      "Surpasses",
      "from dust to a borrowed righteousness",
      "Some essay text.",
      "IIWEEK 2",
      "Blessed Are the Bankrupt",
      "from dust to the kingdom",
      "More essay text.",
    ].join("\n");

    expect(splitStudyPlainTextByHeadings(text).map((l) => l.title)).toEqual([
      "Week 1: The Mountain and the Righteousness That Surpasses",
      "Week 2: Blessed Are the Bankrupt",
    ]);
  });

  it("leaves out a Roman numeral set on its own line between 'WEEK N' and the title", () => {
    // Benedictions, Blessings & Doxologies: "WEEK 1" / "I" / "The Face That Shines".
    const text = [
      "WEEK 1",
      "I",
      "The Face That Shines",
      "from dust to the shining face",
      "Some essay text.",
      "WEEK 4",
      "IV",
      "The First and Better Word",
      "from dust to the original blessing",
      "More essay text.",
      "WEEK 12",
      "XII",
      "Worthy Is the Lamb",
      "from dust to the throne",
      "Last essay text.",
    ].join("\n");

    const lessons = splitStudyPlainTextByHeadings(text);
    expect(lessons.map((l) => l.title)).toEqual([
      "Week 1: The Face That Shines",
      "Week 4: The First and Better Word",
      "Week 12: Worthy Is the Lamb",
    ]);
    expect(JSON.stringify(lessons[0]!.blocks)).not.toContain("The Face That Shines");
  });

  it("keeps a Foreword line that merely starts with 'Before you begin' in ordinary case", () => {
    const text = [
      "Foreword",
      "Before you begin each week",
      "read the passage slowly and pray it back.",
      ...buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις"),
    ].join("\n");

    const introText = splitStudyPlainTextByHeadings(text)[0]!.blocks.map((b) => (b.type === "text" ? b.bodyHtml : "")).join("\n");
    expect(introText).toContain("read the passage slowly and pray it back.");
  });

  it("drops a Study document's Introduction lesson entirely when its front matter has no Foreword or Preface at all", () => {
    const text = [
      "Marketlife Ministries",
      "Soul Dust Revival",
      ...buildWeek(1, "First Week Title", "BOOK 1:1-8", "Am I trusting or striving?", "χάρις"),
    ].join("\n");

    const lessons = splitStudyPlainTextByHeadings(text);

    expect(lessons).toHaveLength(1);
    expect(lessons[0]!.title).toBe("Week 1: First Week Title");
  });

  it("treats the whole document as a single lesson when no WEEK heading is found at all", () => {
    const text = "Just some plain prose with no week structure whatsoever.";
    const lessons = splitStudyPlainTextByHeadings(text);

    expect(lessons).toHaveLength(1);
    expect(lessons[0]!.title).toBe("Imported Content");
  });
});
