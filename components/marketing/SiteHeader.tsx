import Link from "next/link";
import { CartLink } from "./CartLink";
import { getSession } from "@/lib/auth/session";

export async function SiteHeader() {
  const session = await getSession();

  return (
    <header className="border-b border-moss/20 bg-parchment no-print">
      <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="font-display font-black text-lg sm:text-xl text-ink tracking-tight focus:outline-none focus:ring-2 focus:ring-ink rounded"
        >
          Soul Dust <span className="text-ember">Revival</span>
        </Link>

        {/* overflow-x-auto + whitespace-nowrap: same pattern as the admin
            nav (see RESPONSIVE.md) — lets the row scroll horizontally on
            narrow phones instead of each link wrapping mid-label ("Books &"
            / "Studies", "Log" / "in") into a cramped multi-line stack. */}
        <nav
          aria-label="Primary"
          className="flex items-center gap-4 sm:gap-6 font-sans text-sm font-medium overflow-x-auto whitespace-nowrap"
        >
          <Link href="/books" className="text-ink hover:text-ember focus:outline-none focus:ring-2 focus:ring-ink rounded p-1 -m-1">
            Books &amp; Studies
          </Link>
          <Link href="/blog" className="text-ink hover:text-ember focus:outline-none focus:ring-2 focus:ring-ink rounded p-1 -m-1">
            Blog
          </Link>
          <CartLink />
          {session ? (
            <Link
              href="/account"
              className="text-ink hover:text-ember focus:outline-none focus:ring-2 focus:ring-ink rounded p-1 -m-1"
            >
              Account
            </Link>
          ) : (
            <Link
              href="/login"
              className="text-ink hover:text-ember focus:outline-none focus:ring-2 focus:ring-ink rounded p-1 -m-1"
            >
              Log in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
