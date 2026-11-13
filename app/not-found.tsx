import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { getSession } from "@/lib/auth/session";
import { marketingUrl, appUrl } from "@/lib/domains";
import { isSneakPeek } from "@/lib/launchMode";

export const metadata: Metadata = {
  title: "Page not found",
};

// Every unknown URL and every notFound() lands here, on both hosts. It sits
// at the root (outside any route group's layout), so it brings its own
// header and footer rather than showing a bare page with no way back.
export default async function NotFound() {
  const session = await getSession();
  const sneakPeek = isSneakPeek();

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader session={session} />
      <div className="flex-1">
        <div className="max-w-5xl mx-auto px-4 py-16 sm:py-24">
          <p className="font-sans text-sm font-semibold uppercase tracking-wide text-ember-700 mb-3">404</p>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink mb-4">We couldn&apos;t find that page</h1>
          <p className="font-serif text-lg text-moss mb-8 max-w-2xl">
            The link may be old, or the address may have a typo. Try one of these instead.
          </p>
          <ul className="flex flex-wrap gap-3 font-sans text-sm font-medium">
            <li>
              <Link
                href={marketingUrl("/")}
                className="inline-flex items-center min-h-[44px] px-4 rounded-lg bg-ink text-parchment hover:bg-ink/90"
              >
                Home
              </Link>
            </li>
            <li>
              <Link
                href={marketingUrl(sneakPeek ? "/sneak-peek" : "/store")}
                className="inline-flex items-center min-h-[44px] px-4 rounded-lg border border-ink text-ink hover:bg-ink/5"
              >
                {sneakPeek ? "Try a sample" : "Store"}
              </Link>
            </li>
            {session && (
              <li>
                <Link
                  href={appUrl("/library")}
                  className="inline-flex items-center min-h-[44px] px-4 rounded-lg border border-ink text-ink hover:bg-ink/5"
                >
                  My Library
                </Link>
              </li>
            )}
          </ul>
        </div>
      </div>
      <SiteFooter loggedIn={!!session} />
    </div>
  );
}
