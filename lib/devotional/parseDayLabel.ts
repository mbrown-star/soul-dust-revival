export type ParsedDayLabel = {
  day: number;
  date: string; // e.g. "January 1"
  month: string; // e.g. "January"
  dateNum: number; // e.g. 1
  // The reading named in the label, e.g. "Psalm 119 (vv. 161-168)". Null for
  // a label with no reading ("DAY 1 · JANUARY 1", A 365-Day Journey Through
  // the Bible, whose readings open the day itself instead).
  reading: string | null;
  psalmNumber: number | null;
};

// Case-insensitive: the book's own printed day-page headers are set in all
// caps ("DAY 1 · JANUARY 1 · PSALM 1"), imported verbatim as the lesson's
// title -- confirmed against the real data, not assumed.
// The reading part is optional: "DAY 1 · JANUARY 1" (A 365-Day Journey).
const DAY_LABEL = /^day (\d+) · ([a-z]+) (\d+)(?: · (.+))?$/i;

function toSentenceCase(allCaps: string): string {
  return allCaps.toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Parses a devotional lesson's own title -- "DAY 1 · JANUARY 1 · PSALM 1", or
 * just "DAY 1 · JANUARY 1" --
 * into its parts, normalized to sentence case ("January 1", "Psalm 1") for
 * display outside the all-caps-styled spots that already match the book's
 * own typesetting. This is the book's own printed day-page header, imported
 * verbatim as the lesson's title, so no schema change or re-import is needed
 * to drive the Year/Journal views from it. A lesson whose title doesn't
 * match this shape (the "Introduction" lesson, or a hand-edited title)
 * returns null and is simply excluded from the day-indexed views.
 */
export function parseDayLabel(title: string): ParsedDayLabel | null {
  const match = DAY_LABEL.exec(title);
  if (!match) return null;
  const [, dayStr, rawMonth, dateNumStr, rawReading] = match;
  const month = toSentenceCase(rawMonth!);
  const reading = rawReading ? toSentenceCase(rawReading) : null;
  const psalmMatch = reading ? /^Psalm (\d+)/.exec(reading) : null;
  return {
    day: Number(dayStr),
    date: `${month} ${dateNumStr}`,
    month,
    dateNum: Number(dateNumStr),
    reading,
    psalmNumber: psalmMatch ? Number(psalmMatch[1]) : null,
  };
}

/**
 * A day's readings line, printed in capitals ("2 CHRONICLES 32–33 · SONG OF
 * SOLOMON 1 · PSALM 74"), in ordinary case for display, search and screen
 * readers: "2 Chronicles 32–33 · Song of Solomon 1 · Psalm 74".
 */
export function formatReadings(line: string): string {
  const small = new Set(["of", "and", "the"]);
  return line
    .toLowerCase()
    .replace(/\b([a-z])([a-z]*)\b/g, (word, first: string, rest: string, offset: number) =>
      offset > 0 && small.has(word) ? word : first.toUpperCase() + rest
    )
    .replace(/\bVv\b/g, "vv");
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Today's real "Month Day" string, year-agnostic since the book is evergreen
 * (the same Day 1 falls on January 1 every year it's read) -- matches
 * soul-dust-psalms-365's own tools/devotional/devotional_template.html
 * `todayNum()`, including its leap-day fallback (Feb 29 maps to Day 59, the
 * same day a non-leap year's Feb 28 would, rather than matching nothing).
 */
export function todaysDateLabel(now: Date = new Date()): string {
  const month = MONTH_NAMES[now.getMonth()];
  const date = now.getDate();
  return `${month} ${date}`;
}
