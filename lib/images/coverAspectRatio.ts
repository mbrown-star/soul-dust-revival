// A 6x9 book's shape, for a cover with no stored dimensions (or no image).
const FALLBACK_COVER_ASPECT_RATIO = "2 / 3";

/** A CSS aspect-ratio value matching a cover's own stored pixel dimensions. */
export function coverAspectRatio(width: number | null | undefined, height: number | null | undefined): string {
  return width && height && width > 0 && height > 0 ? `${width} / ${height}` : FALLBACK_COVER_ASPECT_RATIO;
}
