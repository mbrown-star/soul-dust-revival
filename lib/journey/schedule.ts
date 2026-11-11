/**
 * The Journey's weekly rhythm: one stop opens each week on the reader's own
 * Journey day, and stops are taken in order. Pure date logic, no database --
 * everything is a plain calendar date ("YYYY-MM-DD") in the reader's own time
 * zone, so a stop opens at the start of his Journey day wherever he is.
 *
 * A rhythm records (see journey_enrollments in lib/db/schema.ts): stops
 * 0..openedThrough are already open by date, the last of them since
 * openedOn, and stop openedThrough+1 opens on nextOpensOn, each later one a
 * week after the one before.
 */

export type JourneyRhythm = {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  openedThrough: number;
  openedOn: string;
  nextOpensOn: string;
};

export type StopState =
  | { state: "completed" }
  /** The next stop to take, and its week has come. */
  | { state: "open" }
  /** Its week hasn't come yet. */
  | { state: "waiting"; opensOn: string }
  /** Its week has come, but an earlier stop isn't finished. */
  | { state: "ahead" };

const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toEpochDay(date: string): number {
  if (!DATE_PATTERN.test(date)) throw new Error(`Not a calendar date: ${date}`);
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

function fromEpochDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromEpochDay(toEpochDay(date) + days);
}

export function weekdayOf(date: string): number {
  // 1970-01-01 was a Thursday (4).
  return (((toEpochDay(date) + 4) % 7) + 7) % 7;
}

/** The first `weekday` strictly after `date`. */
export function nextWeekdayAfter(date: string, weekday: number): string {
  const gap = ((weekday - weekdayOf(date) + 7) % 7) || 7;
  return addDays(date, gap);
}

/** The first `weekday` on or after `date`. */
function weekdayOnOrAfter(date: string, weekday: number): string {
  return addDays(date, (weekday - weekdayOf(date) + 7) % 7);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Today's calendar date where the reader is. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * A new reader's rhythm: stop `openedThrough` (0, unless he'd already finished
 * the stops before it) opens today, the next on his next Journey day.
 */
export function beginRhythm(weekday: number, today: string, openedThrough = 0): JourneyRhythm {
  return { weekday, openedThrough, openedOn: today, nextOpensOn: nextWeekdayAfter(today, weekday) };
}

/**
 * The date a stop opens, or null for a stop that was already open when the
 * rhythm was last set (its exact date no longer matters).
 */
export function stopOpensOn(rhythm: JourneyRhythm, index: number): string | null {
  if (index <= rhythm.openedThrough) return null;
  return addDays(rhythm.nextOpensOn, 7 * (index - rhythm.openedThrough - 1));
}

export function hasStopOpened(rhythm: JourneyRhythm, index: number, today: string): boolean {
  const opensOn = stopOpensOn(rhythm, index);
  return opensOn === null || opensOn <= today;
}

/** The highest stop index open by date today. */
export function openedThroughToday(rhythm: JourneyRhythm, today: string): number {
  if (today < rhythm.nextOpensOn) return rhythm.openedThrough;
  return rhythm.openedThrough + 1 + Math.floor((toEpochDay(today) - toEpochDay(rhythm.nextOpensOn)) / 7);
}

/**
 * Moves the rhythm to a new Journey day. Every stop open today stays open,
 * and the next one opens on the new weekday -- but never sooner than a week
 * after the last stop opened, so changing the day can't speed the Journey up.
 */
export function changeWeekday(rhythm: JourneyRhythm, weekday: number, today: string): JourneyRhythm {
  const openedThrough = openedThroughToday(rhythm, today);
  // When the latest open stop opened: its own date if it opened since the
  // rhythm was last set, otherwise the date already recorded.
  const openedOn = openedThrough > rhythm.openedThrough ? stopOpensOn(rhythm, openedThrough)! : rhythm.openedOn;
  const afterToday = nextWeekdayAfter(today, weekday);
  const fromSpacing = weekdayOnOrAfter(addDays(openedOn, 7), weekday);
  return { weekday, openedThrough, openedOn, nextOpensOn: afterToday > fromSpacing ? afterToday : fromSpacing };
}

/**
 * Each stop's state for one reader. A stop can be read when it's completed or
 * open; everything else is locked. Stops go in order: only the first
 * unfinished stop can be open, and only once its week has come.
 */
export function stopStates(completed: readonly boolean[], rhythm: JourneyRhythm, today: string): StopState[] {
  const firstUnfinished = completed.findIndex((done) => !done);
  return completed.map((done, index): StopState => {
    if (done) return { state: "completed" };
    if (!hasStopOpened(rhythm, index, today)) return { state: "waiting", opensOn: stopOpensOn(rhythm, index)! };
    return index === firstUnfinished ? { state: "open" } : { state: "ahead" };
  });
}

export function canReadStop(state: StopState): boolean {
  return state.state === "completed" || state.state === "open";
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday] ?? "";
}

/** "Tuesday, Nov 18" */
export function formatOpensOn(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}
