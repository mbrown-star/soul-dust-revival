import Link from "next/link";
import { isSneakPeek } from "@/lib/launchMode";

export function SiteFooter() {
  return (
    <footer className="bg-ink text-parchment mt-20 mottle no-print">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <p className="font-display font-black text-lg mb-1">
          Soul Dust <span className="text-gold">Revival</span>
        </p>
        <p className="font-serif italic text-sm text-parchment/70 mb-8 max-w-md">
          &ldquo;My soul cleaves to the dust; Revive me according to Your word.&rdquo;
          {" "}— Psalm 119:25, NASB
        </p>

        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 font-sans text-sm">
          {/* The store is closed on the sneak-peek site (lib/launchMode.ts). */}
          <Link
            href={isSneakPeek() ? "/sneak-peek" : "/store"}
            className="hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold rounded p-1 -m-1"
          >
            {isSneakPeek() ? "Try a sample" : "Books & Studies"}
          </Link>
          <Link href="/blog" className="hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold rounded p-1 -m-1">
            Blog
          </Link>
          <Link href="/privacy" className="hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold rounded p-1 -m-1">
            Privacy
          </Link>
          <Link href="/login" className="hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold rounded p-1 -m-1">
            Log in
          </Link>
          <Link href="/signup" className="hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold rounded p-1 -m-1">
            Sign up
          </Link>
        </nav>

        <p className="font-sans text-xs text-parchment/50 mt-8">
          © {new Date().getFullYear()} Soul Dust Revival.
        </p>
      </div>
    </footer>
  );
}
