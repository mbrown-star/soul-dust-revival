import { describe, expect, it } from "vitest";
import { cleanStoredParts, finishedWeekParts, firstUnfinishedPart, listPartLabels } from "./weekParts";

describe("weekParts", () => {
  it("keeps only known stored parts, once each, in week order", () => {
    expect(cleanStoredParts(["live", "study", "lift", "bogus", "study", 3])).toEqual(["study", "live"]);
    expect(cleanStoredParts(null)).toEqual([]);
  });

  it("counts Lift Up only from the week's completion, never from stored parts", () => {
    expect([...finishedWeekParts(["study", "lift"], false)]).toEqual(["study"]);
    expect([...finishedWeekParts(["study"], true)]).toEqual(["study", "lift"]);
  });

  it("finds the first unfinished part among those shown", () => {
    const shown = ["study", "work", "live", "lift"] as const;
    expect(firstUnfinishedPart(shown, new Set(["study"]))).toBe("work");
    expect(firstUnfinishedPart(shown, new Set(shown))).toBeNull();
  });

  it("lists parts in plain English", () => {
    expect(listPartLabels(["study"])).toBe("Study");
    expect(listPartLabels(["study", "passage"])).toBe("Study and Passage");
    expect(listPartLabels(["study", "passage", "live"])).toBe("Study, Passage and Live It");
  });
});
