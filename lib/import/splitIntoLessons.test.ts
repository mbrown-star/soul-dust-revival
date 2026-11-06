import { describe, expect, it } from "vitest";
import { splitHtmlByHeadings, splitPlainTextByHeadings } from "./splitIntoLessons";

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
