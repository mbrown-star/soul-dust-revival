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
