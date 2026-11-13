/**
 * A study's title without the shared brand prefix:
 * "Soul Dust Revival: Colossians" -> "Colossians". Used by every reader's
 * header (which prints its own "Soul Dust Revival ·" eyebrow) and by the
 * "← Colossians" back link every reader shares.
 */
export function shortStudyTitle(title: string): string {
  const stripped = title.replace(/^soul dust revival:?\s*/i, "").trim();
  return stripped || title;
}
