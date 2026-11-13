import { describe, expect, it } from "vitest";
import { formatReference, splitBookLayoutText } from "./splitBookChapters";
import { parseBookChapterHtml } from "@/lib/book/chapterHtml";

// A two-chapter book in the shape `pdftotext -layout -nopgbrk` gives for
// Revive Me: indented paragraph starts, centered running headers and page
// numbers, an indented Scripture quote, and the "f" glyph as a form feed.
const BOOK = [
  "READ · REFLECT · RETURN",
  "FOREWORD",
  "",
  "A Word Before the First Page",
  "Brother, before you read a single page, you should know how this book came to be.",
  "",
  "May the Lord revive you according to His Word.",
  "",
  "In the dust, and yet not without hope,",
  "The Soul Dust Team",
  "MARKETLIFE MINISTRIES",
  "PREFACE",
  "",
  "Before You Begin",
  "This book began as forty-eight weeks of study, written for men who would",
  "sit with a workbook.",
  "    Read it slowly; one chapter at a sitting is enough.",
  "TWO CHAPTERS AND AN EPILOGUE",
  "",
  "Contents",
  "PART ONE · THE DUST",
  "1    Where Most Men Actually Live        13",
  "                        PARTONE",
  "",
  "                The Dust",
  "The man named honestly.",
  "                                    CHAPTER ONE",
  "",
  "       Where Most Men Actually Live",
  "                               \from dust to honesty",
  "",
  "      “Yahweh God \formed man \from the dust o\f the ground, and breathed",
  "       into his nostrils the breath o\f li\fe.”",
  "                                      GENESIS 2:7",
  "",
  "The slow dri\ft",
  "IT IS 5:40 IN the morning, and the house is still dark. You are up be\fore anyone",
  "else, and the co\f\fee is going cold.",
  "    It is not dramatic, not the kind o\f collapse that makes a headline or a prayer re-",
  "quest; it is just dust. Dust gathers on a man the same way it gathers on",
  "",
  "                                           13",
  "                         SOUL DUST REVIVAL · REVIVE ME",
  "",
  "furniture, because nothing wiped it o\f\f.",
  "    God says over her:",
  "   I will betroth you to me \forever. Yes, I will betroth you to me in righteousness,",
  "   in justice, and in compassion.",
  "   HOSEA 2:19–20",
  "",
  "The Hebrew word is ʾāraś, to betroth.",
  "",
  "TO SIT WITH",
  "",
  "1 What have you been calling a busy season that God would call dust?",
  "",
  "2 What is your soul stuck to right now that you have never said",
  "  out loud?",
  "",
  "                                          18",
  "                     WHERE MOST MEN ACTUALLY LIVE",
  "",
  "BENEDICTION",
  "",
  "Lift Up Your Eyes",
  "He knows what you are made o\f. He \formed the \first man \from the ground and",
  "",
  "                                          19",
  "",
  "bent close enough to breathe into him.",
  "",
  "He came down into it.",
  "",
  "                       END OF CHAPTER ONE · SOUL DUST REVIVAL",
  "                                      EPILOGUE",
  "",
  "                    From Dust to Glory",
  "                               \from revival to glory",
  "",
  "     “He will wipe away every tear \from their eyes.”",
  "                                   REVELATION 21:4",
  "",
  "The road behind you",
  "IT IS EARLY AGAIN, and the house is still dark. The co\f\fee is beside you.",
  "    Look back down the road \for a moment.",
  "    Then you were raised, be\fore you were asked to li\ft a \finger.",
  "TO SIT WITH",
  "1 Where were you lying when this began?",
  "2 Who will you tell?",
  "BENEDICTION",
  "Lift Up Your Eyes",
  "One morning you will see Him.",
  "                       END OF THE EPILOGUE · SOUL DUST REVIVAL",
].join("\n");

describe("splitBookLayoutText", () => {
  const book = splitBookLayoutText(BOOK);

  it("finds the chapters and the epilogue with no warnings", () => {
    expect(book.warnings).toEqual([]);
    expect(book.chapters.map((c) => c.lessonTitle)).toEqual([
      "Chapter 1: Where Most Men Actually Live",
      "Epilogue: From Dust to Glory",
    ]);
  });

  it("reads a chapter's Part, subtitle and opening verse, restoring the f glyph", () => {
    const [chapter] = book.chapters;
    expect(chapter!.part).toBe("Part One · The Dust");
    expect(chapter!.subtitle).toBe("from dust to honesty");
    expect(chapter!.epigraph).toEqual({
      text: "“Yahweh God formed man from the dust of the ground, and breathed into his nostrils the breath of life.”",
      reference: "Genesis 2:7",
    });
    expect(book.chapters[1]!.part).toBeNull();
  });

  it("makes paragraphs from indents, rejoins hyphens and page breaks, and drops page furniture", () => {
    const html = book.chapters[0]!.textHtml;
    expect(book.chapters[0]!.headings).toEqual(["The slow drift"]);
    expect(html).toContain("<h3>The slow drift</h3><p>IT IS 5:40 IN the morning");
    expect(html).toContain("collapse that makes a headline or a prayer request; it is just dust. Dust gathers on a man the same way it gathers on furniture, because nothing wiped it off.</p>");
    expect(html).not.toMatch(/SOUL DUST REVIVAL|>13<|WHERE MOST MEN/);
  });

  it("keeps an indented Scripture quote whole, with its reference", () => {
    expect(book.chapters[0]!.textHtml).toContain(
      "<blockquote><p>I will betroth you to me forever. Yes, I will betroth you to me in righteousness, in justice, and in compassion.</p><p>— Hosea 2:19–20</p></blockquote><p>The Hebrew word is ʾāraś, to betroth.</p>"
    );
  });

  it("reads both questions, wrapped lines included, and the blessing's paragraphs across a page break", () => {
    const [chapter] = book.chapters;
    expect(chapter!.questions).toEqual([
      "What have you been calling a busy season that God would call dust?",
      "What is your soul stuck to right now that you have never said out loud?",
    ]);
    expect(chapter!.benedictionTitle).toBe("Lift Up Your Eyes");
    expect(chapter!.benedictionHtml).toBe(
      "<p>He knows what you are made of. He formed the first man from the ground and bent close enough to breathe into him.</p><p>He came down into it.</p>"
    );
  });

  it("builds the Introduction from the Foreword and Preface, keeping the signature's line break", () => {
    expect(book.introductionHtml).toBe(
      "<h2>Foreword</h2><p><em>A Word Before the First Page</em></p>" +
        "<p>Brother, before you read a single page, you should know how this book came to be.</p>" +
        "<p>May the Lord revive you according to His Word.</p>" +
        "<p>In the dust, and yet not without hope,<br>The Soul Dust Team</p>" +
        "<h2>Preface</h2><p><em>Before You Begin</em></p>" +
        "<p>This book began as forty-eight weeks of study, written for men who would sit with a workbook.</p>" +
        "<p>Read it slowly; one chapter at a sitting is enough.</p>"
    );
  });

  it("stores the opener so the reader can read it back", () => {
    const parsed = parseBookChapterHtml(book.chapters[0]!.textHtml);
    expect(parsed).toMatchObject({
      part: "Part One · The Dust",
      title: "Where Most Men Actually Live",
      subtitle: "from dust to honesty",
      epigraph: { reference: "Genesis 2:7" },
    });
    expect(parsed!.bodyHtml.startsWith("<h3>The slow drift</h3>")).toBe(true);
  });

  it("warns when a chapter is missing its questions", () => {
    const broken = splitBookLayoutText(BOOK.replace("TO SIT WITH\n\n1 What have", "1 What have"));
    expect(broken.warnings).toContain("Chapter 1: no TO SIT WITH.");
  });
});

describe("formatReference", () => {
  it("puts a capitals reference into ordinary case", () => {
    expect(formatReference("GENESIS 2:7")).toBe("Genesis 2:7");
    expect(formatReference("1 JOHN 1:9")).toBe("1 John 1:9");
    expect(formatReference("SONG OF SOLOMON 2:4")).toBe("Song of Solomon 2:4");
    expect(formatReference("ECCLESIASTES 4:9–10")).toBe("Ecclesiastes 4:9–10");
  });
});
