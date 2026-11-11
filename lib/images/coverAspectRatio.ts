// A 6x9 book's shape, for a cover with no stored dimensions (or no image).
const FALLBACK_COVER_ASPECT_RATIO = "2 / 3";

// The one slot shape every cover is shown in, wherever covers need to line
// up (Store tiles, the product page's gallery). It matches the widest cover
// shape we sell (an 8.5x11 crop is ~0.765, The Journey bundle art ~0.773),
// so the widest covers fill the slot and narrower ones (6x9, ~0.667) keep
// the full height and sit a little narrower, centered.
export const COVER_SLOT_ASPECT_RATIO = "31 / 40";

/** A CSS aspect-ratio value matching a cover's own stored pixel dimensions. */
export function coverAspectRatio(width: number | null | undefined, height: number | null | undefined): string {
  return width && height && width > 0 && height > 0 ? `${width} / ${height}` : FALLBACK_COVER_ASPECT_RATIO;
}
