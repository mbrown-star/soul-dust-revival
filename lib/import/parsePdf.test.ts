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
