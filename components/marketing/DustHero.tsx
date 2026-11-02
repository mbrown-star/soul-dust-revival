import Link from "next/link";

// Fixed set of mote positions/timings — deterministic (no client-side
// randomness), so there's no server/client hydration mismatch risk, while
// still reading as organic rather than a uniform grid.
const MOTES = [
  { left: "8%", size: 3, delay: 0, duration: 9 },
  { left: "15%", size: 5, delay: 2.2, duration: 11 },
  { left: "23%", size: 2, delay: 4.8, duration: 8 },
  { left: "31%", size: 4, delay: 1.1, duration: 10 },
  { left: "39%", size: 3, delay: 6.3, duration: 12 },
  { left: "47%", size: 6, delay: 3.4, duration: 9 },
  { left: "55%", size: 2, delay: 0.6, duration: 11 },
  { left: "63%", size: 4, delay: 5.5, duration: 8 },
  { left: "71%", size: 3, delay: 2.9, duration: 10 },
  { left: "79%", size: 5, delay: 7.2, duration: 9 },
  { left: "87%", size: 2, delay: 1.8, duration: 12 },
  { left: "93%", size: 4, delay: 4.1, duration: 10 },
];

export function DustHero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-gold via-ember to-ink">
      {/* Dust motes drifting up off the ground line — the hero's signature
          element, rendering Psalm 119:25 directly rather than illustrating it. */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        {MOTES.map((m, i) => (
          <span
            key={i}
            className="dust-mote absolute bottom-24 rounded-full bg-parchment"
            style={{
              left: m.left,
              width: m.size,
              height: m.size,
              animationDelay: `${m.delay}s`,
              animationDuration: `${m.duration}s`,
            }}
          />
        ))}
      </div>

      {/* Ground line */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-ink" aria-hidden="true" />

      <div className="relative max-w-3xl mx-auto px-4 py-20 sm:py-28 text-center">
        <p className="font-sans text-sm sm:text-base tracking-[0.2em] text-ink/70 uppercase mb-6">
          Psalm 119:25
        </p>
        <h1 className="font-display font-black text-4xl sm:text-6xl text-ink leading-[0.95] mb-3">
          Soul Dust
          <br />
          Revival
        </h1>
        <p className="font-serif italic text-lg sm:text-xl text-ink/80 max-w-xl mx-auto mb-10">
          &ldquo;My soul clings to the dust; give me life according to your word.&rdquo;
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
