import { describe, expect, it } from "vitest";
import { parsePassageText } from "./parsePassageText";

describe("parsePassageText", () => {
  it("reads chapter:verse markers and bare verse numbers in the current chapter", () => {
    expect(parsePassageText("1:1 Paul, an apostle\n2 To the saints\n3 We give thanks")).toEqual([
      { c: 1, n: 1, text: "Paul, an apostle" },
      { c: 1, n: 2, text: "To the saints" },
      { c: 1, n: 3, text: "We give thanks" },
    ]);
  });

  it("switches chapter when a new chapter:verse marker appears", () => {
    const verses = parsePassageText("1:29 For this I toil\n2:1 For I want you to know");
    expect(verses.map((v) => [v.c, v.n])).toEqual([
      [1, 29],
      [2, 1],
    ]);
  });

  it("joins an unnumbered line onto the previous verse, and skips blank lines", () => {
    expect(parsePassageText("5 because of the hope\n\nlaid up for you in heaven")).toEqual([
      { c: 1, n: 5, text: "because of the hope laid up for you in heaven" },
    ]);
  });

  it("uses the given starting chapter for bare verse numbers", () => {
    expect(parsePassageText("12 giving thanks", 3)).toEqual([{ c: 3, n: 12, text: "giving thanks" }]);
  });

  it("accepts a period as the chapter/verse separator", () => {
    expect(parsePassageText("4.2 Continue steadfastly")).toEqual([{ c: 4, n: 2, text: "Continue steadfastly" }]);
  });

  it("drops verse 0, which the schema would reject", () => {
    expect(parsePassageText("0 Heading text\n1 Real verse")).toEqual([{ c: 1, n: 1, text: "Real verse" }]);
  });
});
