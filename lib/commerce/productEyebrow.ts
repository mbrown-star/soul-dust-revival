/**
 * The extra "what kind of content is this, and how's it bound" suffix
 * appended to a product's existing format-based eyebrow label (e.g. "Book &
 * Study"), separated with " - " per the admin's own request. Shared by the
 * public /books listing and a product's own detail page so the two can't
 * drift apart.
 *
 * Deliberately omits "Book" (kind: "book" with no binding set) rather than
 * always showing the kind -- a plain book with nothing new specified yet
 * keeps today's exact eyebrow text unchanged, and "Book" would otherwise be
 * redundant next to wording that already says "Book" via the format branch.
 * Study/Devotional are real, useful distinctions the existing text can't
 * already convey (both render as the same generic "Study"/"Book & Study"
 * wording today regardless of which kind is actually linked), so those
 * always show once set.
 */
export function productKindBindingSuffix(
  kind: "study" | "devotional" | "book",
  bookBinding: "softback" | "hardback" | null
): string {
  const parts: string[] = [];
  if (kind === "study") parts.push("Study");
  else if (kind === "devotional") parts.push("Devotional");
  if (bookBinding === "softback") parts.push("Softback");
  else if (bookBinding === "hardback") parts.push("Hardback");
  return parts.length > 0 ? ` - ${parts.join(", ")}` : "";
}
