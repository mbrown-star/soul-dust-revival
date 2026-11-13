import Link from "next/link";
import { isSneakPeek } from "@/lib/launchMode";
import { appUrl } from "@/lib/domains";

const linkClass = "hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold rounded p-1 -m-1";

/** `loggedIn` decides the account links, matching the header's: Log in and
 *  Sign up when signed out, App and Account when signed in. */
export function SiteFooter({ loggedIn }: { loggedIn: boolean }) {
  return (
    <footer className="bg-ink text-parchment mt-20 mottle no-print">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <p className="font-display font-black text-lg mb-1">
          Soul Dust <span className="text-gold">Revival</span>
        </p>
        <p className="font-serif italic text-sm text-parchment/70 mb-8 max-w-md">
          &ldquo;My soul clings to the dust; Revive me according to Your word.&rdquo;
          {" "}— Psalm 119:25, NKJV
        </p>

        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 font-sans text-sm">
          {/* The store is closed on the sneak-peek site (lib/launchMode.ts). */}
          <Link
            href={isSneakPeek() ? "/sneak-peek" : "/store"}
            className={linkClass}
          >
            {isSneakPeek() ? "Try a sample" : "Store"}
          </Link>
          {/* Open on both sites: Amazon sells the printed books whether or not
              our own store is. */}
          <Link href="/claim" className={linkClass}>
            Bought on Amazon? Claim your digital edition
          </Link>
          <Link href="/blog" className={linkClass}>
            Blog
          </Link>
          {/* For everyone: a guest's Contact page gives the email address,
              since the form itself needs an account. */}
          <Link href="/contact" className={linkClass}>
            Contact
          </Link>
          <Link href="/privacy" className={linkClass}>
            Privacy
          </Link>
          {loggedIn ? (
            <>
              <Link href={appUrl("/library")} className={linkClass}>
                App
              </Link>
              <Link href={appUrl("/account")} className={linkClass}>
                Account
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className={linkClass}>
                Log in
              </Link>
              <Link href="/signup" className={linkClass}>
                Sign up
              </Link>
            </>
          )}
        </nav>

        <p className="font-sans text-xs text-parchment/50 mt-8">
          © {new Date().getFullYear()} Soul Dust Revival.
        </p>
      </div>
    </footer>
  );
}
