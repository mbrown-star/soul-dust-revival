import { parseDayLabel } from "@/lib/devotional/parseDayLabel";
import { parseBookLessonTitle } from "@/lib/book/chapterHtml";
import type { StudyKind } from "./studyKindLabel";

/**
 * What a study is counted in, and which of its lessons count. A study counts
 * its weeks, a devotional its days, a book its chapters (the Epilogue
 * included); an Introduction is read but not counted. One rule for My
 * Library's cards, a study's contents page and each reader's own ring, so
 * Colossians reads "1/12 weeks" everywhere, not "1/13" (staging audit,
 * 2026-11-13).
 */
export function countsAsUnit(kind: StudyKind, lessonTitle: string): boolean {
  if (kind === "devotional") return parseDayLabel(lessonTitle) !== null;
  if (kind === "book") {
    const label = parseBookLessonTitle(lessonTitle);
    return label?.kind === "chapter" || label?.kind === "epilogue";
  }
  return /^week \d+/i.test(lessonTitle.trim());
}

/** "week"/"weeks", "day"/"days" or "chapter"/"chapters". */
export function unitNoun(kind: StudyKind, count: number): string {
  const singular = kind === "devotional" ? "day" : kind === "book" ? "chapter" : "week";
  return count === 1 ? singular : `${singular}s`;
}

/**
 * The lessons a study is counted by, or every lesson when none match (a
 * study whose lessons aren't titled "Week N", say), so nothing reads 0/0.
 */
export function countedLessons<T extends { title: string }>(kind: StudyKind, lessons: T[]): T[] {
  const units = lessons.filter((l) => countsAsUnit(kind, l.title));
  return units.length > 0 ? units : lessons;
}

/** The number a lesson's own title carries ("Week 3: …" → "3"), if any. */
export function ownLessonNumber(lessonTitle: string): string | null {
  return /^(?:week|day|chapter)\s+(\d+)\b/i.exec(lessonTitle.trim())?.[1] ?? null;
}

/**
 * A lesson title as a list shows it. A devotional day's label is stored in
 * the book's capitals ("DAY 1 · JANUARY 1 · PSALM 1"); lists show it in
 * sentence case ("Day 1 · January 1 · Psalm 1"). Anything else is unchanged.
 */
export function displayLessonTitle(lessonTitle: string): string {
  const day = parseDayLabel(lessonTitle);
  if (!day) return lessonTitle;
  return [`Day ${day.day}`, day.date, day.reading].filter(Boolean).join(" · ");
}
