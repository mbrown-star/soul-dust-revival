"use client";

import { useRef, useState } from "react";
import Image from "next/image";

type Cover = { url: string; alt: string };

/**
 * Horizontally scrollable front/back cover gallery for a book's detail
 * page. Falls back to a single static front-cover image (or the plain
 * text placeholder) when there's no back cover — most non-book products
 * only ever have one image.
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
      <div className="aspect-[3/4] bg-dusk rounded-lg overflow-hidden relative flex items-center justify-center text-parchment/70 font-display">
        Soul Dust Revival
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

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="no-scrollbar aspect-[3/4] bg-dusk rounded-lg overflow-x-auto relative flex snap-x snap-mandatory scroll-smooth motion-reduce:scroll-auto"
        style={{ scrollbarWidth: "none" }}
        role="group"
        aria-label={covers.length > 1 ? "Front and back cover" : "Cover image"}
      >
        {covers.map((cover, i) => (
          <div key={cover.url} className="relative w-full h-full flex-shrink-0 snap-center">
            <Image
              src={cover.url}
              alt={cover.alt}
              fill
              sizes="(min-width: 640px) 50vw, 100vw"
              className="object-cover"
              priority={i === 0}
            />
          </div>
        ))}
      </div>

      {covers.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => scrollToIndex(activeIndex - 1)}
            disabled={activeIndex === 0}
            aria-label="Show front cover"
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-ink/70 text-parchment rounded-full w-9 h-9 flex items-center justify-center disabled:opacity-0 focus:outline-none focus:ring-2 focus:ring-gold"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => scrollToIndex(activeIndex + 1)}
            disabled={activeIndex === covers.length - 1}
            aria-label="Show back cover"
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-ink/70 text-parchment rounded-full w-9 h-9 flex items-center justify-center disabled:opacity-0 focus:outline-none focus:ring-2 focus:ring-gold"
          >
            ›
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2" role="group" aria-label="Cover images">
            {covers.map((cover, i) => (
              <button
                key={cover.url}
                type="button"
                aria-pressed={i === activeIndex}
                aria-label={i === 0 ? "Front cover" : "Back cover"}
                onClick={() => scrollToIndex(i)}
                className={`w-2.5 h-2.5 rounded-full focus:outline-none focus:ring-2 focus:ring-gold ${
                  i === activeIndex ? "bg-gold" : "bg-parchment/60"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
