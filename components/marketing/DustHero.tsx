import Link from "next/link";
import Image from "next/image";

export function DustHero() {
  return (
    <section className="relative overflow-hidden min-h-[70vh] sm:min-h-[85vh]">
      <Image
        src="/images/hero-sunset.jpg"
        alt="Desert sunset with dust haze over a wide plain"
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />

      {/* Darkens the photo toward the bottom so the overlaid text and the
          ground line stay readable without flattening the sky. */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-ink/0 via-ink/35 to-ink/85"
        aria-hidden="true"
      />

      {/* Ground line */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-ink" aria-hidden="true" />

      <div className="relative max-w-3xl mx-auto px-4 py-20 sm:py-28 text-center">
        <p className="font-sans text-sm sm:text-base tracking-[0.2em] text-parchment/70 uppercase mb-6">
          Psalm 119:25
        </p>
        <h1 className="font-display font-black text-4xl sm:text-6xl text-parchment leading-[0.95] mb-3 drop-shadow-[0_2px_24px_rgba(26,18,12,0.5)]">
          Soul Dust
          <br />
          Revival
        </h1>
        <p className="font-serif italic text-lg sm:text-xl text-parchment/90 max-w-xl mx-auto mb-10">
          &ldquo;My soul cleaves to the dust; Revive me according to Your word.&rdquo;
        </p>
        <p className="font-serif text-base sm:text-lg text-parchment max-w-2xl mx-auto mb-10">
          Studies, devotionals, and a discipleship path for men willing to be honest about
          the dust — and willing to be revived.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/books"
            className="font-sans font-semibold bg-ink text-parchment rounded-lg px-6 py-3 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gold focus:ring-ink"
          >
            Explore studies &amp; books
          </Link>
          <Link
            href="/blog"
            className="font-sans font-semibold bg-parchment/90 text-ink rounded-lg px-6 py-3 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gold focus:ring-ink"
          >
            Read the blog
          </Link>
        </div>
      </div>
    </section>
  );
}
