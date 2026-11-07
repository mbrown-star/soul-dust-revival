import Link from "next/link";
import { marketingUrl } from "@/lib/domains";

// The single source of truth for the site's header chrome: sizing (sticky,
// max-w-5xl, the same padding/height everywhere) and color (bg-ink/95 +
// backdrop blur), plus the monogram + wordmark lockup that routes home. Both
// the public SiteHeader and the admin nav bar render through this shell so
// they can never drift apart in size or color again -- any new top-level nav
// bar should be built on this shell too, rather than restyled by hand.
export function SiteHeaderShell({ children }: { children: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink/20 bg-ink/95 backdrop-blur-sm no-print">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* No ring/box on focus/click -- same text-color-only focus treatment
            as the nav links (see SiteNav.tsx's linkClass), applied here via
            a slight brightness lift on the badge ring and wordmark instead of
            an outline. */}
        <Link
          href={marketingUrl("/")}
          className="group flex items-center gap-2.5 flex-shrink-0 focus:outline-none"
        >
          <span
            aria-hidden="true"
            className="w-8 h-8 rounded-full border-2 border-gold group-focus:border-parchment flex items-center justify-center flex-shrink-0"
          >
            <span className="font-display text-gold group-focus:text-parchment text-[11px] leading-none">
              SDR
            </span>
          </span>
          <span className="font-display text-lg sm:text-xl bg-gradient-to-r from-gold via-ember to-ember-700 bg-clip-text text-transparent tracking-tight group-focus:opacity-80">
            Soul Dust Revival
          </span>
        </Link>
        {children}
      </div>
    </header>
  );
}
