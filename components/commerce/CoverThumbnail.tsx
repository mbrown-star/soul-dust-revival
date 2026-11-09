import Image from "next/image";

// A fixed box every tile shares, so a row of differently-shaped covers (real
// covers vary from ~0.665 to ~0.767 width/height, confirmed against every
// real product) still lines up into a uniform grid. `object-cover` fills
// this box edge-to-edge with no visible background -- the explicit choice
// over `object-contain` (found live 2026-11-09, even later: letterboxing
// instead kept every cover fully uncropped, but exposed this box's own
// background color as visible padding around whichever covers didn't
// exactly match the ratio, which read as "images sitting on a background"
// and was rejected in favor of this tradeoff: a uniform, edge-to-edge grid
// with no background, accepting that a cover whose own shape doesn't match
// this box gets a small amount cropped off its outer edges). Each cover's
// own border is already centered with equal margins on every side (see
// lib/images/bookCover.ts), so a crop here only ever trims a bit of that
// margin -- it was specifically fixed to never again cut into real content
// or the spine itself, so this crop can't reintroduce that older bug.
const TILE_ASPECT_RATIO = "3 / 4";

/**
 * Renders a product's cover inside a uniform-sized tile. Used by both the
 * homepage's Featured content grid and the /books listing grid, which
 * previously had two independent, identically broken copies of this same
 * cropped-box markup.
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
          className="object-cover group-hover:scale-105 group-focus:scale-105 transition-transform"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-parchment/70 font-display text-sm">
          Soul Dust Revival
        </div>
      )}
    </div>
  );
}
