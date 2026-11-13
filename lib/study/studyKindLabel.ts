export type StudyKind = "devotional" | "study" | "book";

/**
 * The display word for a study's `kind`, shared by every place that shows
 * it (admin studies list, My Library, a study's own /studies/[slug] page) --
 * a single source of truth so a 3-way kind can't silently regress to a
 * binary study/devotional ternary in just one of them, as already happened
 * more than once with the near-identical products.kind label.
 */
export function studyKindLabel(kind: StudyKind): string {
  if (kind === "study") return "Study";
  if (kind === "book") return "Book";
  return "Devotional";
}

/**
 * The Kind choices on the admin's product and study forms, in the one order
 * both list them (Book, Devotional, Study). Each says what the reader gets.
 */
export const STUDY_KIND_OPTION_LABELS: Record<StudyKind, string> = {
  book: "Book (chapters, with questions to answer)",
  devotional: "Devotional (daily readings, one question a day)",
  study: "Study (weekly lessons, saves answers)",
};
