import Image from "next/image";
import { coverAspectRatio } from "@/lib/images/coverAspectRatio";

/**
 * Renders a product's cover in a tile shaped to that cover's own stored
 * dimensions, so the whole double-line border box and its margin always
 * show -- a 6x9 cover (~0.667) and an 8.5x11 cover (~0.765) each get a tile
 * of their own shape rather than one shared box that would crop one of them
 * (an explicit decision, 2026-11-10: tiles in a row may differ in height).
 * Used by both the homepage's Featured content grid and the /books grid.
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
    <div
      className="bg-dusk rounded-xl overflow-hidden shadow-lg relative"
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
  );
}
