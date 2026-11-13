import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "./date";

describe("formatDate", () => {
  it("writes the date out in full, in UTC", () => {
    expect(formatDate("2026-11-05T12:00:00Z")).toBe("November 5, 2026");
    // Late evening in the US is already the next day in UTC: one answer everywhere.
    expect(formatDate(new Date("2026-11-07T02:30:00Z"))).toBe("November 7, 2026");
  });

  it("adds the time, marked UTC, when asked", () => {
    expect(formatDateTime("2026-11-05T15:04:00Z")).toMatch(/^November 5, 2026.* 3:04 PM UTC$/);
  });
});
