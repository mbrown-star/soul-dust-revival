import { describe, it, expect } from "vitest";
import { formatReadings, parseDayLabel, todaysDateLabel } from "./parseDayLabel";

describe("parseDayLabel", () => {
  it("parses a day title with a simple psalm reference", () => {
    expect(parseDayLabel("Day 1 · January 1 · Psalm 1")).toEqual({
      day: 1,
      date: "January 1",
      month: "January",
      dateNum: 1,
      reading: "Psalm 1",
      psalmNumber: 1,
    });
  });

  it("parses the real all-caps title format the book's own day headers use", () => {
    expect(parseDayLabel("DAY 1 · JANUARY 1 · PSALM 1")).toEqual({
      day: 1,
      date: "January 1",
      month: "January",
      dateNum: 1,
      reading: "Psalm 1",
      psalmNumber: 1,
    });
  });

  it("parses a day title with a verse-range psalm reference", () => {
    const parsed = parseDayLabel("DAY 310 · NOVEMBER 6 · PSALM 119 (VV. 161–168)");
    expect(parsed).toMatchObject({
      day: 310,
      date: "November 6",
      month: "November",
      dateNum: 6,
      psalmNumber: 119,
    });
    expect(parsed?.reading).toBe("Psalm 119 (vv. 161–168)");
  });

  it("parses a day title with no reading (A 365-Day Journey Through the Bible)", () => {
    expect(parseDayLabel("DAY 200 · JULY 19")).toEqual({
      day: 200,
      date: "July 19",
      month: "July",
      dateNum: 19,
      reading: null,
      psalmNumber: null,
    });
  });

  it("returns null for a title that doesn't match the day-label shape", () => {
    expect(parseDayLabel("Introduction")).toBeNull();
    expect(parseDayLabel("Week 1: The Faith That Bears Fruit")).toBeNull();
  });
});

describe("todaysDateLabel", () => {
  it("formats a date as 'Month Day', year-agnostic", () => {
    expect(todaysDateLabel(new Date(2026, 0, 1))).toBe("January 1");
    expect(todaysDateLabel(new Date(2030, 10, 6))).toBe("November 6");
  });
});

describe("formatReadings", () => {
  it("puts a capitals readings line in ordinary case", () => {
    expect(formatReadings("GENESIS 1–2 · MATTHEW 1:1–12 · PSALM 1")).toBe("Genesis 1–2 · Matthew 1:1–12 · Psalm 1");
    expect(formatReadings("2 CHRONICLES 32–33 · SONG OF SOLOMON 1 · PSALM 74")).toBe("2 Chronicles 32–33 · Song of Solomon 1 · Psalm 74");
  });
});
