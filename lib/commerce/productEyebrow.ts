type ProductFormat = "physical" | "digital" | "both";
type ProductKind = "study" | "devotional" | "book";
type ProductType = "book" | "study_access" | "bundle";

/**
 * The base label for how a (non-bundle) product is sold: "Book" (physical
 * only), "Digital" (digital only), or "Book & Digital" (both) -- never the
 * word "Study"/"Devotional", which used to be hardcoded here regardless of
 * the product's actual `kind` (a product could be kind: "book"/"devotional"
 * and still show "Book & Study"). What kind of reading experience it is
 * belongs entirely to `kind`, folded in by productEyebrowLabel below.
 */
export function productFormatLabel(format: ProductFormat): string {
  if (format === "digital") return "Digital";
  if (format === "both") return "Book & Digital";
  return "Book";
}

/**
 * The full storefront eyebrow label for a product, shared by the public
 * /books listing, the homepage's featured grid, and a product's own detail
 * page so the three can't drift apart (they already have once).
 *
 * - Non-bundle: "{format label} - {kind}, {binding}", e.g. "Book - Study",
 *   "Digital - Devotional", "Book & Digital", "Book - Softback". `kind`
 *   omits "Book" (kind: "book" with no binding set) rather than always
 *   showing it -- a plain book with nothing else to say keeps the format
 *   label alone, and "Book" would otherwise be redundant next to wording
 *   that already says "Book" via the format label.
 * - Bundle: "Bundle - {kind} & {format label}" (kind omitted the same way,
 *   format label never is), e.g. "Bundle - Study & Digital", or
 *   "Bundle - Book" for a plain physical bundle with no kind set.
 */
export function productEyebrowLabel({
  type,
  kind,
  format,
  bookBinding,
}: {
  type: ProductType;
  kind: ProductKind;
  format: ProductFormat;
  bookBinding: "softback" | "hardback" | null;
}): string {
  const formatWord = productFormatLabel(format);
  const kindWord = kind === "study" ? "Study" : kind === "devotional" ? "Devotional" : null;
  const bindingWord =
    bookBinding === "softback" ? "Softback" : bookBinding === "hardback" ? "Hardback" : null;

  if (type === "bundle") {
    const inner = [kindWord, formatWord].filter(Boolean).join(" & ");
    const withBinding = bindingWord ? `${inner}, ${bindingWord}` : inner;
    return withBinding ? `Bundle - ${withBinding}` : "Bundle";
  }

  const suffix = [kindWord, bindingWord].filter(Boolean).join(", ");
  return suffix ? `${formatWord} - ${suffix}` : formatWord;
}
