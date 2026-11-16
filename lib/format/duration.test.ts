import { describe, expect, it } from "vitest";
import { formatDuration } from "./duration";

describe("formatDuration", () => {
  it("reads seconds, minutes and hours", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(45)).toBe("45 sec");
    expect(formatDuration(60)).toBe("1 min");
    expect(formatDuration(12 * 60 + 20)).toBe("12 min");
    expect(formatDuration(3600)).toBe("1 h");
    expect(formatDuration(3900)).toBe("1 h 5 min");
  });
});
