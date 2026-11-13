import { describe, expect, it } from "vitest";
import { journeyStopTitle } from "./stopTitle";

describe("journeyStopTitle", () => {
  it("names a Part's threshold as its introduction", () => {
    expect(journeyStopTitle({ isThreshold: true, label: "Part One", title: "Introduction" })).toBe("Part One introduction");
  });

  it("reads a week title's second colon as a dash", () => {
    expect(
      journeyStopTitle({ isThreshold: false, label: "Week 25", title: "Week 25: Confession & Repentance: An Overview" })
    ).toBe("Week 25: Confession & Repentance — An Overview");
    expect(journeyStopTitle({ isThreshold: false, label: "Week 1", title: "Week 1: The Dust" })).toBe("Week 1: The Dust");
  });
});
