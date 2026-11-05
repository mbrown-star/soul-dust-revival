import Link from "next/link";
import { SiteNav } from "./SiteNav";
import { getSession } from "@/lib/auth/session";

export async function SiteHeader() {
  const session = await getSession();

  return (
    <header className="sticky top-0 z-40 border-b border-ink/20 bg-ink/95 backdrop-blur-sm no-print">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 focus:outline-none focus:ring-2 focus:ring-gold rounded"
        >
          <span
            aria-hidden="true"
            className="w-8 h-8 rounded-full border-2 border-gold flex items-center justify-center flex-shrink-0"
          >
            <span className="font-display text-gold text-[11px] leading-none">SDR</span>
          </span>
          <span className="font-display text-lg sm:text-xl bg-gradient-to-r from-gold via-ember to-ember-700 bg-clip-text text-transparent tracking-tight">
            Soul Dust Revival
          </span>
        </Link>
        <SiteNav loggedIn={!!session} />
      </div>
    </header>
  );
}
