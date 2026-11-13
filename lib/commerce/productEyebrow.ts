type ProductFormat = "physical" | "digital" | "both";
type ProductKind = "study" | "devotional" | "book";
type ProductType = "book" | "study_access" | "bundle";

const KIND_LABEL: Record<ProductKind, string> = {
  book: "Book",
  study: "Study",
  devotional: "Devotional",
};

// A bundle is several of its kind, so its eyebrow reads plural.
const BUNDLE_KIND_LABEL: Record<ProductKind, string> = {
  book: "Books",
  study: "Studies",
  devotional: "Devotionals",
};

/**
 * The storefront eyebrow label for a product, shared by the public /store
 * listing, the homepage's featured grid, and a product's own detail page so
 * the three can't drift apart (they already have, more than once).
 *
 * Always the product's `kind` as a plain word (Book / Study / Devotional),
 * with " & Digital" appended whenever it's available digitally (format
 * "digital" or "both"), or when a printed title comes with its digital
 * edition (a linked study, claimed on /claim for an Amazon copy). A bundle
 * gets a "Bundle - " prefix and the plural kind word, e.g. "Bundle - Studies & Digital".
 */
export function productEyebrowLabel({
  type,
  kind,
  format,
  includesDigitalEdition = false,
}: {
  type: ProductType;
  kind: ProductKind;
  format: ProductFormat;
  includesDigitalEdition?: boolean;
}): string {
  const isBundle = type === "bundle";
  const kindWord = isBundle ? BUNDLE_KIND_LABEL[kind] : KIND_LABEL[kind];
  const label = format === "physical" && !includesDigitalEdition ? kindWord : `${kindWord} & Digital`;
  return isBundle ? `Bundle - ${label}` : label;
}
