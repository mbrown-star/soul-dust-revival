import { describe, expect, it } from "vitest";
import { partWeekRanges } from "./featured";
import type { JourneyPart, JourneyStop } from "./load";

function part(index: number, label: string): JourneyPart {
  return { index, studyId: `s${index}`, studySlug: `s${index}`, productId: `p${index}`, label, shortLabel: `Part ${index + 1}` };
}

function stops(partIndex: number, weeks: number, start: number): JourneyStop[] {
  return Array.from({ length: weeks + 1 }, (_, i) => ({
    index: start + i,
    lessonId: `l${partIndex}-${i}`,
    partIndex,
    title: i === 0 ? "Introduction" : `Week ${i}`,
    label: i === 0 ? `Part ${partIndex + 1}` : `Week ${i}`,
    isThreshold: i === 0,
    href: "#",
  }));
}

describe("partWeekRanges", () => {
  it("numbers weeks across the Journey, leaving out each Part's introduction", () => {
    const parts = [part(0, "Part One — Out of the Dust"), part(1, "Part Two — Formed and Sent")];
    expect(partWeekRanges({ parts, stops: [...stops(0, 12, 0), ...stops(1, 12, 13)] })).toEqual([
      { label: "Part One — Out of the Dust", firstWeek: 1, lastWeek: 12 },
      { label: "Part Two — Formed and Sent", firstWeek: 13, lastWeek: 24 },
    ]);
  });

  it("gives a Part with no weeks yet no range, and doesn't shift the next one", () => {
    const parts = [part(0, "Part One"), part(1, "Part Two"), part(2, "Part Three")];
    const all = [...stops(0, 3, 0), ...stops(1, 0, 4), ...stops(2, 2, 5)];
    expect(partWeekRanges({ parts, stops: all })).toEqual([
      { label: "Part One", firstWeek: 1, lastWeek: 3 },
      { label: "Part Two", firstWeek: null, lastWeek: null },
      { label: "Part Three", firstWeek: 4, lastWeek: 5 },
    ]);
  });

  it("is empty for a Journey with no published Parts", () => {
    expect(partWeekRanges({ parts: [], stops: [] })).toEqual([]);
  });
});
