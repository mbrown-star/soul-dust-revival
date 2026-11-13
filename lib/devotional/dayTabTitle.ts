import { parseDayLabel } from "./parseDayLabel";
import { parseDevotionalHtml } from "./parseDevotionalHtml";

/**
 * A devotional day's browser-tab title: "Day 1: Two Trees, Two Soils",
 * rather than the book's all-caps day label ("DAY 1 · JANUARY 1 · PSALM 1",
 * the lesson's own title). Falls back to "Day 1" when the day's text has no
 * separate title, and to the lesson title for anything that isn't a day
 * (the Introduction).
 */
export function devotionalDayTabTitle(lessonTitle: string, dayHtml: string | null | undefined): string {
  const label = parseDayLabel(lessonTitle);
  if (!label) return lessonTitle;
  const dayTitle = dayHtml ? parseDevotionalHtml(dayHtml).title.trim() : "";
  // A day whose first heading is its own label has no separate title.
  return dayTitle && !parseDayLabel(dayTitle) ? `Day ${label.day}: ${dayTitle}` : `Day ${label.day}`;
}
