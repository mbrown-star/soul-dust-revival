import { describe, expect, it } from "vitest";
import { countedLessons, displayLessonTitle, ownLessonNumber, unitNoun } from "./lessonUnits";

const lessons = (titles: string[]) => titles.map((title) => ({ title }));

describe("lessonUnits", () => {
  it("counts a study's weeks, not its Introduction", () => {
    expect(countedLessons("study", lessons(["Introduction", "Week 1: A", "Week 2: B"]))).toHaveLength(2);
    expect(unitNoun("study", 2)).toBe("weeks");
  });

  it("counts a devotional's days and a book's chapters with its Epilogue", () => {
    expect(countedLessons("devotional", lessons(["Introduction", "DAY 1 · JANUARY 1 · PSALM 1"]))).toHaveLength(1);
    expect(countedLessons("book", lessons(["Introduction", "Chapter 1: Dust", "Epilogue: Home"]))).toHaveLength(2);
    expect(unitNoun("devotional", 1)).toBe("day");
    expect(unitNoun("book", 27)).toBe("chapters");
  });

  it("counts every lesson when none is titled as a unit", () => {
    expect(countedLessons("study", lessons(["Session A", "Session B"]))).toHaveLength(2);
  });

  it("reads a title's own number and sentence-cases a day label", () => {
    expect(ownLessonNumber("Week 12: The End")).toBe("12");
    expect(ownLessonNumber("Introduction")).toBeNull();
    expect(displayLessonTitle("DAY 1 · JANUARY 1 · PSALM 1")).toBe("Day 1 · January 1 · Psalm 1");
    expect(displayLessonTitle("DAY 9 · JANUARY 9")).toBe("Day 9 · January 9");
    expect(displayLessonTitle("Week 1: Grace")).toBe("Week 1: Grace");
  });
});
