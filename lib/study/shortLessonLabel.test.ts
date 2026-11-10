import { describe, expect, it } from "vitest";
import { shortLessonLabel } from "./shortLessonLabel";

describe("shortLessonLabel", () => {
  it("uses the part before the colon for a study week", () => {
    expect(shortLessonLabel("Week 4: Rooted and Built Up")).toBe("Week 4");
  });

  it("names a devotional day by its day number", () => {
    expect(shortLessonLabel("DAY 4 · JANUARY 4 · PSALM 4")).toBe("Day 4");
  });

  it("falls back to the whole title", () => {
    expect(shortLessonLabel("Introduction")).toBe("Introduction");
  });
});
