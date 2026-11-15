import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { firstLocalRun, localToday, toUtcSchedule } from "./localSchedule";

// Date's local-time methods read process.env.TZ, so each test can pick a zone.
const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

describe("toUtcSchedule", () => {
  beforeEach(() => {
    process.env.TZ = "America/New_York";
  });

  it("turns 9am Eastern into 14:00 UTC the same day", () => {
    expect(toUtcSchedule({ frequency: "once", startDate: "2026-11-16", timeOfDay: "09:00" })).toEqual({
      dayOfWeek: undefined,
      startDate: "2026-11-16T00:00:00.000Z",
      timeOfDay: "14:00",
      endDate: undefined,
    });
  });

  it("rolls an evening local time onto the next UTC day", () => {
    const s = toUtcSchedule({ frequency: "once", startDate: "2026-11-16", timeOfDay: "21:30" });
    expect(s.startDate).toBe("2026-11-17T00:00:00.000Z");
    expect(s.timeOfDay).toBe("02:30");
  });

  it("moves a weekly start to the chosen weekday and gives its UTC weekday", () => {
    // 2026-11-16 is a Monday; Friday 8pm Eastern is Saturday 01:00 UTC.
    const local = { frequency: "weekly" as const, dayOfWeek: 5, startDate: "2026-11-16", timeOfDay: "20:00" };
    expect(firstLocalRun(local).getDay()).toBe(5);
    expect(toUtcSchedule(local)).toMatchObject({ dayOfWeek: 6, startDate: "2026-11-21T00:00:00.000Z", timeOfDay: "01:00" });
  });

  it("ends a recurring post at the end of the local end date", () => {
    const s = toUtcSchedule({ frequency: "daily", startDate: "2026-11-16", timeOfDay: "09:00", endDate: "2026-11-20" });
    expect(s.endDate).toBe("2026-11-21T04:59:59.999Z");
  });

  it("uses daylight time in summer", () => {
    expect(toUtcSchedule({ frequency: "once", startDate: "2026-07-01", timeOfDay: "09:00" }).timeOfDay).toBe("13:00");
  });
});

describe("in UTC itself", () => {
  it("changes nothing", () => {
    process.env.TZ = "UTC";
    expect(toUtcSchedule({ frequency: "once", startDate: "2026-11-16", timeOfDay: "09:00" })).toMatchObject({
      startDate: "2026-11-16T00:00:00.000Z",
      timeOfDay: "09:00",
    });
    expect(localToday(new Date("2026-11-16T23:30:00Z"))).toBe("2026-11-16");
  });
});
