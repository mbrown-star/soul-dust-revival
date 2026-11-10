import { parseDayLabel } from "@/lib/devotional/parseDayLabel";

/**
 * A lesson's short name for a sentence like "Week 4 unlocks at launch and
 * purchase": "Day 4" for a devotional day ("DAY 4 · JANUARY 4 · PSALM 4"),
 * the part before the colon for a study week ("Week 4: Rooted"), otherwise
 * the whole title.
 */
export function shortLessonLabel(title: string): string {
  const day = parseDayLabel(title);
  if (day) return `Day ${day.day}`;
  const beforeColon = title.split(":")[0]?.trim();
  return beforeColon || title;
}
