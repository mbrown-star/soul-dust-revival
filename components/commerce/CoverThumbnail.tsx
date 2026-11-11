import Image from "next/image";
import { coverAspectRatio } from "@/lib/images/coverAspectRatio";

// Every tile slot shares this shape, so a row of covers lines up at one
// height. It matches the widest cover shape we sell (an 8.5x11 crop is
// ~0.765, The Journey bundle art ~0.773), so the widest covers fill their
// column and narrower ones (6x9, ~0.667) keep the full height and simply sit
// a little narrower, centered.
const TILE_SLOT_ASPECT_RATIO = "31 / 40";

/**
 * Renders a product's cover at one shared height, each at its own true
 * shape (from its stored dimensions) -- never cropped and never on a
 * visible background box, so the whole double-line border and its margin
 * always show (explicit decision, 2026-11-10). Used by both the homepage's
 * Featured content grid and the /store grid.
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
  return (
    <div className="flex justify-center" style={{ aspectRatio: TILE_SLOT_ASPECT_RATIO }}>
      <div
        className="relative h-full max-w-full bg-dusk rounded-xl overflow-hidden shadow-lg"
        style={{ aspectRatio: coverAspectRatio(imageWidth, imageHeight) }}
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
    </div>
  );
}
