/**
 * One line naming what a product or bundle costs, in the Store's own words:
 * "Printed $20.00 · Digital $15.00", "Printed $25.00" or "Digital $30.00".
 * Used by the admin Products and Bundles lists so they read the same.
 */
export function priceSummary({
  format,
  priceCents,
  digitalPriceCents,
}: {
  format: "physical" | "digital" | "both";
  priceCents: number;
  digitalPriceCents: number | null;
}): string {
  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  if (format === "physical") return `Printed ${dollars(priceCents)}`;
  if (format === "digital") return `Digital ${dollars(priceCents)}`;
  return `Printed ${dollars(priceCents)} · Digital ${digitalPriceCents == null ? "price not set" : dollars(digitalPriceCents)}`;
}

/**
 * A product's price as the Store shows it to readers. A title sold both
 * ways shows both, digital first: "Digital $15.00 · Printed $20.00"
 * (homepage and Store tiles, the Journey banner, a bundle's parts). A tile
 * used to show only the printed price, the higher one (staging audit,
 * 2026-11-13). A title sold one way shows its one price.
 */
export function storePriceLine({
  format,
  priceCents,
  digitalPriceCents,
}: {
  format: "physical" | "digital" | "both";
  priceCents: number;
  digitalPriceCents: number | null;
}): string {
  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  if (format === "both" && digitalPriceCents != null) {
    return `Digital ${dollars(digitalPriceCents)} · Printed ${dollars(priceCents)}`;
  }
  return dollars(priceCents);
}
