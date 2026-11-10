type ProductFormat = "physical" | "digital" | "both";
type ProductKind = "study" | "devotional" | "book";
type ProductType = "book" | "study_access" | "bundle";

const KIND_LABEL: Record<ProductKind, string> = {
  book: "Book",
  study: "Study",
  devotional: "Devotional",
};

/**
 * The storefront eyebrow label for a product, shared by the public /books
 * listing, the homepage's featured grid, and a product's own detail page so
 * the three can't drift apart (they already have, more than once).
 *
 * Always the product's `kind` as a plain word (Book / Study / Devotional),
 * with " & Digital" appended whenever it's available digitally (format
 * "digital" or "both"). A bundle keeps a "Bundle - " prefix in front of the
 * same label, e.g. "Bundle - Book & Digital".
 */
export function productEyebrowLabel({
  type,
  kind,
  format,
}: {
  type: ProductType;
  kind: ProductKind;
  format: ProductFormat;
}): string {
  const label = format === "physical" ? KIND_LABEL[kind] : `${KIND_LABEL[kind]} & Digital`;
  return type === "bundle" ? `Bundle - ${label}` : label;
}
