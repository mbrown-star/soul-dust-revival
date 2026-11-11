import { describe, it, expect } from "vitest";
import {
  addDays,
  beginRhythm,
  canReadStop,
  changeWeekday,
  formatOpensOn,
  isValidTimeZone,
  openedThroughToday,
  stopOpensOn,
  stopStates,
  todayIn,
  weekdayOf,
} from "./schedule";

// 2026-11-10 is a Tuesday.
const TUE = "2026-11-10";

describe("date helpers", () => {
  it("knows the weekday of a date", () => {
    expect(weekdayOf(TUE)).toBe(2);
    expect(weekdayOf("2026-11-15")).toBe(0);
  });

  it("reads today in the reader's own time zone", () => {
    // 03:30 UTC on Wednesday is still Tuesday evening in Chicago.
    const now = new Date("2026-11-11T03:30:00Z");
    expect(todayIn("UTC", now)).toBe("2026-11-11");
    expect(todayIn("America/Chicago", now)).toBe(TUE);
    expect(todayIn("Pacific/Auckland", now)).toBe("2026-11-11");
  });

  it("rejects an unknown time zone", () => {
    expect(isValidTimeZone("America/Chicago")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });

  it("formats an opening date", () => {
    expect(formatOpensOn("2026-11-17")).toBe("Tuesday, Nov 17");
  });
});

describe("beginRhythm", () => {
  it("opens stop 0 today and stop 1 a week later when the Journey day is today", () => {
    const rhythm = beginRhythm(2, TUE);
    expect(stopOpensOn(rhythm, 0)).toBeNull();
    expect(stopOpensOn(rhythm, 1)).toBe("2026-11-17");
    expect(stopOpensOn(rhythm, 51)).toBe(addDays("2026-11-17", 7 * 50));
  });

  it("opens stop 1 on the next chosen weekday", () => {
    // Begun on a Tuesday with Friday as the Journey day.
    expect(beginRhythm(5, TUE).nextOpensOn).toBe("2026-11-13");
    // Begun on a Tuesday with Monday as the Journey day.
    expect(beginRhythm(1, TUE).nextOpensOn).toBe("2026-11-16");
  });

  it("takes a full year for 52 stops", () => {
    const rhythm = beginRhythm(2, TUE);
    expect(stopOpensOn(rhythm, 51)).toBe("2027-11-02");
  });

  it("keeps a weekly cadence through a daylight-saving change", () => {
    // US clocks change on 2027-03-14; plain dates are unaffected.
    const rhythm = { weekday: 0, openedThrough: 0, nextOpensOn: "2027-03-07" };
    expect(stopOpensOn(rhythm, 2)).toBe("2027-03-14");
    expect(stopOpensOn(rhythm, 3)).toBe("2027-03-21");
  });
});

describe("openedThroughToday", () => {
  const rhythm = beginRhythm(2, TUE);
  it("counts the stops whose date has come", () => {
    expect(openedThroughToday(rhythm, TUE)).toBe(0);
    expect(openedThroughToday(rhythm, "2026-11-16")).toBe(0);
    expect(openedThroughToday(rhythm, "2026-11-17")).toBe(1);
    expect(openedThroughToday(rhythm, "2026-12-01")).toBe(3);
  });
});

describe("stopStates", () => {
  const rhythm = beginRhythm(2, TUE);

  it("opens only stop 0 on the first day", () => {
    const states = stopStates([false, false, false], rhythm, TUE);
    expect(states).toEqual([
      { state: "open" },
      { state: "waiting", opensOn: "2026-11-17" },
      { state: "waiting", opensOn: "2026-11-24" },
    ]);
  });

  it("keeps the next stop waiting for its date after the current one is done", () => {
    const states = stopStates([true, false, false], rhythm, "2026-11-12");
    expect(states[0]).toEqual({ state: "completed" });
    expect(states[1]).toEqual({ state: "waiting", opensOn: "2026-11-17" });
  });

  it("lets a reader who fell behind catch up, but only in order", () => {
    // Three weeks in, nothing done: three stops' dates have come.
    const states = stopStates([false, false, false, false, false], rhythm, "2026-12-01");
    expect(states.map((s) => s.state)).toEqual(["open", "ahead", "ahead", "ahead", "waiting"]);
    expect(states.map(canReadStop)).toEqual([true, false, false, false, false]);
  });

  it("opens the next caught-up stop as soon as the one before is done", () => {
    const states = stopStates([true, true, false, false], rhythm, "2026-12-01");
    expect(states.map((s) => s.state)).toEqual(["completed", "completed", "open", "ahead"]);
  });

  it("never lets a reader get ahead of the calendar", () => {
    const states = stopStates([true, true, false], rhythm, "2026-11-17");
    expect(states[2]).toEqual({ state: "waiting", opensOn: "2026-11-24" });
    expect(canReadStop(states[2]!)).toBe(false);
  });

  it("keeps a completed stop readable even out of order", () => {
    const states = stopStates([false, true], rhythm, TUE);
    expect(states[1]).toEqual({ state: "completed" });
    expect(canReadStop(states[1]!)).toBe(true);
  });
});

describe("changeWeekday", () => {
  const rhythm = beginRhythm(2, TUE); // Tuesdays

  it("keeps every open stop open and moves the next one to the new day", () => {
    // Two weeks in (stops 0-2 open, stop 2 on Tue the 24th), on Wednesday,
    // switch to Saturdays: the 28th is under a week after the 24th, so the
    // next stop waits for Saturday, Dec 5.
    const today = "2026-11-25";
    const moved = changeWeekday(rhythm, 6, today);
    expect(moved.openedThrough).toBe(2);
    expect(moved.nextOpensOn).toBe("2026-12-05");
    expect(weekdayOf(moved.nextOpensOn)).toBe(6);
  });

  it("never opens the next stop sooner than a week after the last one", () => {
    // Stop 1 opened Tuesday the 17th. On Wednesday the 18th, switching to
    // Thursday must not open stop 2 the next day.
    const moved = changeWeekday(rhythm, 4, "2026-11-18");
    expect(moved.openedThrough).toBe(1);
    expect(moved.nextOpensOn).toBe("2026-11-26");
  });

  it("can't be used to open a stop every day", () => {
    let current = rhythm;
    let today = TUE;
    for (let i = 0; i < 6; i++) {
      today = addDays(today, 1);
      current = changeWeekday(current, weekdayOf(addDays(today, 1)), today);
    }
    // Six days of switching later, still only stop 0 (and at most one more).
    expect(openedThroughToday(current, today)).toBeLessThanOrEqual(1);
  });

  it("may move the next stop later", () => {
    const moved = changeWeekday(rhythm, 1, "2026-11-12");
    expect(moved.openedThrough).toBe(0);
    expect(moved.nextOpensOn).toBe("2026-11-23");
  });

  it("never closes a stop that is already open", () => {
    const today = "2026-12-03";
    const before = openedThroughToday(rhythm, today);
    const moved = changeWeekday(rhythm, 0, today);
    expect(openedThroughToday(moved, today)).toBe(before);
  });
});
