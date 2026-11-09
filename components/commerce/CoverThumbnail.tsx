import Image from "next/image";

// A fixed box every tile shares, so a row of differently-shaped covers (real
// covers vary from ~0.665 to ~0.767 width/height, confirmed against every
// real product) still lines up into a uniform grid (found live 2026-11-09,
// later: rendering each cover at its own natural size, with no shared box at
// all, kept every cover uncropped but made the grid itself uneven -- every
// tile a different height). `object-contain` (not `object-cover`) is what
// keeps this from re-introducing the original cropping bug this box's
// predecessor had: the full image always fits inside, letterboxed on
// whichever side doesn't match this ratio, never cut off.
const TILE_ASPECT_RATIO = "3 / 4";

/**
 * Renders a product's cover inside a uniform-sized tile, in full, never
 * cropped. Used by both the homepage's Featured content grid and the
 * /books listing grid, which previously had two independent, identically
 * broken copies of this same cropped-box markup.
 */
export function CoverThumbnail({
  imageUrl,
  imageAlt,
  sizes,
}: {
  imageUrl: string | null;
  imageAlt: string | null;
  sizes: string;
}) {
  return (
    <div
      className="bg-dusk rounded-xl overflow-hidden shadow-lg relative"
      style={{ aspectRatio: TILE_ASPECT_RATIO }}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={imageAlt ?? ""}
          fill
          sizes={sizes}
          className="object-contain group-hover:scale-105 group-focus:scale-105 transition-transform"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-parchment/70 font-display text-sm">
          Soul Dust Revival
        </div>
      )}
    </div>
  );
}
