/**
 * The five parts of a tabbed Study week, in the order the reader works
 * through them. Four are saved in lesson_progress.parts_done; the fifth,
 * Lift Up, is the week's own completion (`status === "completed"`), so the
 * week tracker and My Library can never disagree about whether it's done.
 */
export const WEEK_PARTS = ["study", "passage", "work", "live", "lift"] as const;
export type WeekPart = (typeof WEEK_PARTS)[number];

/** The parts kept in parts_done (everything but Lift Up). */
export const STORED_WEEK_PARTS = ["study", "passage", "work", "live"] as const;
export type StoredWeekPart = (typeof STORED_WEEK_PARTS)[number];

export const WEEK_PART_LABELS: Record<WeekPart, string> = {
  study: "Study",
  passage: "Passage",
  work: "Work the Word",
  live: "Live It",
  lift: "Lift Up",
};

/** What finishes each part, shown at the top of its tab. Matches each tab's own button. */
export const WEEK_PART_HINTS: Record<WeekPart, string> = {
  study: "Read the opening and the Parts, then tap “Done with the reading.”",
  passage: "Read the passage, then tap “Read and memorized.”",
  work: "Answer each question and open its word study to finish this step.",
  live: "Choose this week’s practices, then tap “Living it this week.”",
  lift: "Pray the benediction, then tap “Carry it into the day.” That also marks the week complete.",
};

export function isStoredWeekPart(value: unknown): value is StoredWeekPart {
  return typeof value === "string" && (STORED_WEEK_PARTS as readonly string[]).includes(value);
}

/** Only known parts, once each, in week order (stored arrays can hold anything an old client sent). */
export function cleanStoredParts(values: readonly unknown[] | null | undefined): StoredWeekPart[] {
  const set = new Set((values ?? []).filter(isStoredWeekPart));
  return STORED_WEEK_PARTS.filter((p) => set.has(p));
}

/** Every finished part of a week: the stored four plus Lift Up when the week is complete. */
export function finishedWeekParts(
  partsDone: readonly unknown[] | null | undefined,
  completed: boolean
): Set<WeekPart> {
  const done = new Set<WeekPart>(cleanStoredParts(partsDone));
  if (completed) done.add("lift");
  return done;
}

/** The first part (of those shown) not finished yet, or null when all are. */
export function firstUnfinishedPart(shown: readonly WeekPart[], done: ReadonlySet<WeekPart>): WeekPart | null {
  return shown.find((p) => !done.has(p)) ?? null;
}

/** "Study", "Study and Passage", "Study, Passage and Live It". */
export function listPartLabels(parts: readonly WeekPart[]): string {
  const labels = parts.map((p) => WEEK_PART_LABELS[p]);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}
