export type ParsedDayLabel = {
  day: number;
  date: string; // e.g. "January 1"
  month: string; // e.g. "January"
  dateNum: number; // e.g. 1
  psalmRef: string; // e.g. "Psalm 119 (vv. 161-168)"
  psalmNumber: number | null;
};

// Case-insensitive: the book's own printed day-page headers are set in all
// caps ("DAY 1 · JANUARY 1 · PSALM 1"), imported verbatim as the lesson's
// title -- confirmed against the real data, not assumed.
const DAY_LABEL = /^day (\d+) · ([a-z]+) (\d+) · (.+)$/i;

function toSentenceCase(allCaps: string): string {
  return allCaps.toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Parses a devotional lesson's own title -- "DAY 1 · JANUARY 1 · PSALM 1" --
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
  const [, dayStr, rawMonth, dateNumStr, rawPsalmRef] = match;
  const month = toSentenceCase(rawMonth!);
  const psalmRef = toSentenceCase(rawPsalmRef!);
  const psalmMatch = /^Psalm (\d+)/.exec(psalmRef);
  return {
    day: Number(dayStr),
    date: `${month} ${dateNumStr}`,
    month,
    dateNum: Number(dateNumStr),
    psalmRef,
    psalmNumber: psalmMatch ? Number(psalmMatch[1]) : null,
  };
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
