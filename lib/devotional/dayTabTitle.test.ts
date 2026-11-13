import { describe, expect, it } from "vitest";
import { devotionalDayTabTitle } from "./dayTabTitle";

describe("devotionalDayTabTitle", () => {
  it("names the day by number and its own title", () => {
    const html = "<p><strong>Two Trees, Two Soils</strong></p>\n<p>“He will be like a tree.”</p>\n<p><strong>— PSALM 1:3</strong></p>";
    expect(devotionalDayTabTitle("DAY 1 · JANUARY 1 · PSALM 1", html)).toBe("Day 1: Two Trees, Two Soils");
  });

  it("skips a day's readings line to find its title", () => {
    const html = "<p><strong>GENESIS 17–18 · MATTHEW 6:18–34 · PSALM 9</strong></p>\n<p><strong>Is Anything Too Hard?</strong></p>";
    expect(devotionalDayTabTitle("DAY 9 · JANUARY 9", html)).toBe("Day 9: Is Anything Too Hard?");
  });

  it("falls back to the day number, and leaves anything that isn't a day alone", () => {
    expect(devotionalDayTabTitle("DAY 9 · JANUARY 9 · PSALM 8", "<p>No title here.</p>")).toBe("Day 9");
    expect(devotionalDayTabTitle("DAY 9 · JANUARY 9 · PSALM 8", null)).toBe("Day 9");
    expect(
      devotionalDayTabTitle("DAY 9 · JANUARY 9 · PSALM 8", "<p><strong>DAY 9 · JANUARY 9 · PSALM 8</strong></p>")
    ).toBe("Day 9");
    expect(devotionalDayTabTitle("Introduction", "<p><strong>FOREWORD</strong></p>")).toBe("Introduction");
  });
});
