import { describe, expect, it } from "vitest";
import { displayVerseRef } from "./verseRef";

describe("displayVerseRef", () => {
  it("reads a printed reference in ordinary case, without its translation", () => {
    expect(displayVerseRef("NUMBERS 6:24–26 · WEB")).toBe("Numbers 6:24–26");
    expect(displayVerseRef("1 PETER 1:3 (NKJV)")).toBe("1 Peter 1:3");
  });

  it("leaves a reference already in ordinary case alone", () => {
    expect(displayVerseRef("Colossians 1:6")).toBe("Colossians 1:6");
  });
});
