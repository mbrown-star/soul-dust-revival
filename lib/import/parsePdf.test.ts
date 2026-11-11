import { describe, expect, it, vi } from "vitest";

const getTextMock = vi.fn();
const destroyMock = vi.fn();

vi.mock("pdf-parse", () => ({
  PDFParse: class {
    getText = getTextMock;
    destroy = destroyMock;
  },
}));

const { parsePdfToText } = await import("./parsePdf");

describe("parsePdfToText", () => {
  it("requests an empty pageJoiner, so pdf-parse's own page-number marker isn't mixed into the text", async () => {
    getTextMock.mockResolvedValue({ pages: [{ num: 1, text: "Hello" }] });
    await parsePdfToText(Buffer.from(""));
    expect(getTextMock).toHaveBeenCalledWith({ pageJoiner: "" });
  });

  it("drops NUL and other control characters (a decorative ornament can extract as NUL, which Postgres rejects)", async () => {
    getTextMock.mockResolvedValue({ pages: [{ num: 1, text: "Before the ornament.\n\u0000\nAfter it.\u0007\tTabbed." }] });
    const text = await parsePdfToText(Buffer.from(""));
    expect(text).not.toMatch(/[\u0000\u0007]/);
    expect(text).toContain("Before the ornament.");
    expect(text).toContain("After it.\tTabbed.");
  });

  it("strips a line that recurs across most pages as a running header/footer", async () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({
      num: i + 1,
      text: `My Book Title ${i + 1}\nReal content for page ${i + 1}.`,
    }));
    getTextMock.mockResolvedValue({ pages });

    const text = await parsePdfToText(Buffer.from(""));

    expect(text).not.toContain("My Book Title");
    expect(text).toContain("Real content for page 1.");
    expect(text).toContain("Real content for page 10.");
  });

  it("does not strip a line that recurs in the middle of every page, even on every single page", async () => {
    // A real regression: a devotional's "Lift Up Your Eyes" callout label is
    // genuine body content repeated by design on nearly every page, not page
    // furniture -- the frequency check alone (ignoring position) mistook it
    // for a running header/footer and deleted it from every lesson.
    const pages = Array.from({ length: 10 }, (_, i) => ({
      num: i + 1,
      text: [
        `Day ${i + 1} heading`,
        `Some intro text for day ${i + 1}.`,
        `More body text for day ${i + 1}.`,
        "Lift Up Your Eyes",
        `A reflection for day ${i + 1}.`,
        `A closing thought for day ${i + 1}.`,
        `The very last line of day ${i + 1}.`,
      ].join("\n"),
    }));
    getTextMock.mockResolvedValue({ pages });

    const text = await parsePdfToText(Buffer.from(""));

    expect(text).toContain("Lift Up Your Eyes");
  });

  it("strips a bare page-number line left over after the real page footer is removed", async () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({
      num: i + 1,
      text: `Real content for page ${i + 1}.\n${i + 1}`,
    }));
    getTextMock.mockResolvedValue({ pages });

    const text = await parsePdfToText(Buffer.from(""));
    const lines = text.split("\n");

    expect(lines).not.toContain("1");
    expect(lines).not.toContain("10");
    expect(text).toContain("Real content for page 1.");
  });

  it("collapses letter-by-letter spaced text back into real words", async () => {
    getTextMock.mockResolvedValue({
      pages: [{ num: 1, text: "G e n e s i s 2 : 7 ; P s a l m 1 0 3 : 1 4" }],
    });

    const text = await parsePdfToText(Buffer.from(""));

    expect(text).toBe("Genesis 2 : 7 ; Psalm 103 : 14");
  });

  it("leaves ordinary text with occasional short words alone", async () => {
    getTextMock.mockResolvedValue({
      pages: [{ num: 1, text: "I am a soul in the dust, and a friend." }],
    });

    const text = await parsePdfToText(Buffer.from(""));

    expect(text).toBe("I am a soul in the dust, and a friend.");
  });

  it("leaves a line alone when it only appears on a couple of pages", async () => {
    const pages = [
      { num: 1, text: "A one-off heading\nSome content." },
      { num: 2, text: "Different content entirely." },
      { num: 3, text: "More different content." },
      { num: 4, text: "Yet more content." },
    ];
    getTextMock.mockResolvedValue({ pages });

    const text = await parsePdfToText(Buffer.from(""));

    expect(text).toContain("A one-off heading");
  });

  it("always destroys the parser, even on success", async () => {
    getTextMock.mockResolvedValue({ pages: [] });
    await parsePdfToText(Buffer.from(""));
    expect(destroyMock).toHaveBeenCalled();
  });
});
