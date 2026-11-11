"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { COVER_SLOT_ASPECT_RATIO, coverAspectRatio } from "@/lib/images/coverAspectRatio";

type Cover = { url: string; alt: string; width: number | null; height: number | null };

/**
 * Front/back cover gallery for a product's detail page.
 *
 * Every product's gallery is the same slot shape (COVER_SLOT_ASPECT_RATIO,
 * the one the Store tiles use), with each cover shown whole at its own
 * shape, centered at full slot height. So the slot, and the control row
 * under it, sit in exactly the same place on every product page whatever
 * the cover's trim (explicit request, 2026-11-11). The controls are never
 * laid over the art, and a disabled arrow stays in place (dimmed) rather
 * than disappearing, so nothing shifts as the reader moves between covers.
 */
export function CoverGallery({
  front,
  back,
}: {
  front: Cover | null;
  back: Cover | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const covers = [front, back].filter((c): c is Cover => c !== null);

  if (covers.length === 0) {
    return (
      <div className="flex justify-center" style={{ aspectRatio: COVER_SLOT_ASPECT_RATIO }}>
        <div
          className="h-full max-w-full bg-dusk rounded-lg flex items-center justify-center text-parchment/70 font-display"
          style={{ aspectRatio: coverAspectRatio(null, null) }}
        >
          Soul Dust Revival
        </div>
      </div>
    );
  }

  function scrollToIndex(index: number) {
    const container = scrollRef.current;
    if (!container) return;
    const clamped = Math.max(0, Math.min(index, covers.length - 1));
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    container.scrollTo({ left: clamped * container.clientWidth, behavior: prefersReducedMotion ? "auto" : "smooth" });
    setActiveIndex(clamped);
  }

  function handleScroll() {
    const container = scrollRef.current;
    if (!container || container.clientWidth === 0) return;
    setActiveIndex(Math.round(container.scrollLeft / container.clientWidth));
  }

  const arrowClass =
    "w-9 h-9 flex items-center justify-center rounded-full border border-moss/30 text-ink hover:bg-moss/10 disabled:opacity-30 disabled:hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-gold";

  return (
    <div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="no-scrollbar overflow-x-auto flex snap-x snap-mandatory scroll-smooth motion-reduce:scroll-auto"
        style={{ scrollbarWidth: "none", aspectRatio: COVER_SLOT_ASPECT_RATIO }}
        role="group"
        aria-label={covers.length > 1 ? "Front and back cover" : "Cover image"}
      >
        {covers.map((cover, i) => (
          <div key={cover.url} className="w-full h-full flex-shrink-0 snap-center flex justify-center">
            <div
              className="relative h-full max-w-full bg-dusk rounded-lg overflow-hidden"
              style={{ aspectRatio: coverAspectRatio(cover.width, cover.height) }}
            >
              <Image
                src={cover.url}
                alt={cover.alt}
                fill
                sizes="(min-width: 640px) 50vw, 100vw"
                className="object-cover"
                priority={i === 0}
              />
            </div>
          </div>
        ))}
      </div>

      {covers.length > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => scrollToIndex(activeIndex - 1)}
            disabled={activeIndex === 0}
            aria-label="Show front cover"
            className={arrowClass}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <div className="flex gap-2" role="group" aria-label="Cover images">
            {covers.map((cover, i) => (
              <button
                key={cover.url}
                type="button"
                aria-pressed={i === activeIndex}
                aria-label={i === 0 ? "Front cover" : "Back cover"}
                onClick={() => scrollToIndex(i)}
                className={`w-2.5 h-2.5 rounded-full focus:outline-none focus:ring-2 focus:ring-gold ${
                  i === activeIndex ? "bg-ember-700" : "bg-moss/30"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => scrollToIndex(activeIndex + 1)}
            disabled={activeIndex === covers.length - 1}
            aria-label="Show back cover"
            className={arrowClass}
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      )}
    </div>
  );
}
