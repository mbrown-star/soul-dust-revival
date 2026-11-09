import Image from "next/image";

// Used only when a product has no stored imageWidth/imageHeight yet (an
// image uploaded before this was captured, or a failed client-side read) --
// close to the width/height ratio most real covers land on, so the
// fallback-sized box looks reasonable rather than badly off.
const FALLBACK_RATIO = 2 / 3;
const FALLBACK_WIDTH = 600;
const FALLBACK_HEIGHT = Math.round(FALLBACK_WIDTH / FALLBACK_RATIO);

/**
 * Renders a product's cover at its own true aspect ratio -- never cropped
 * into a fixed-ratio box, per the explicit requirement (2026-11-09): real
 * covers vary in shape (~0.665 to ~0.766 width/height, confirmed against
 * every real product), so forcing all of them into one box always cropped
 * someone's. Used by both the homepage's Featured content grid and the
 * /books listing grid, which previously had two independent, identically
 * broken copies of this same cropped-box markup.
 */
export function CoverThumbnail({
  imageUrl,
  imageAlt,
  imageWidth,
  imageHeight,
  sizes,
}: {
  imageUrl: string | null;
  imageAlt: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  sizes: string;
}) {
  if (!imageUrl) {
    return (
      <div className="aspect-[2/3] bg-dusk rounded-xl shadow-lg flex items-center justify-center text-parchment/70 font-display text-sm">
        Soul Dust Revival
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden shadow-lg">
      <Image
        src={imageUrl}
        alt={imageAlt ?? ""}
        width={imageWidth ?? FALLBACK_WIDTH}
        height={imageHeight ?? FALLBACK_HEIGHT}
        sizes={sizes}
        className="w-full h-auto group-hover:scale-105 group-focus:scale-105 transition-transform"
      />
    </div>
  );
}
