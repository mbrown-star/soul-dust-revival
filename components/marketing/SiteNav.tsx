"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CartLink } from "./CartLink";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { marketingUrl, appUrl } from "@/lib/domains";

type NavItem = { label: string; href: string };

// No ring/box around a focused or just-clicked item -- focus is still
// visible (WCAG 2.4.7), just via the same text-color change already used
// for hover, rather than an outline.
const linkClass = "text-parchment/80 hover:text-gold focus:outline-none focus:text-gold p-1 -m-1";

export function SiteNav({ loggedIn, isAdmin = false }: { loggedIn: boolean; isAdmin?: boolean }) {
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Same sign-out sequence as AccountPageClient.tsx: clear the Supabase
  // session client-side, then refresh so every server-rendered bit of the
  // page (this nav included) re-fetches with no session.
  async function handleLogOut() {
    setLoggingOut(true);
    setProfileOpen(false);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    // marketingUrl, not a bare "/" -- logging out from the app domain should
    // land on the real marketing homepage directly, not bounce through a
    // middleware redirect from the app domain's own "/".
    router.push(marketingUrl("/"));
    router.refresh();
  }

  // Closes on an outside click or Escape -- a menu that can only be
  // dismissed by clicking exactly the toggle button again is a real
  // usability bug, not an edge case. Following a link inside the menu closes
  // it via that link's own onClick below, rather than watching the route
  // from an effect (which would mean calling setState synchronously on every
  // navigation, including ones that didn't come from this menu at all).
  useEffect(() => {
    if (!profileOpen) return;

    function handlePointerDown(e: PointerEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setProfileOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileOpen]);

  // Public items (visible to every visitor) sit at the left. Items that only
  // make sense once signed in sit at the far right, set off from the public
  // items by a vertical rule.
  // marketingUrl/appUrl -- absolute cross-domain links once the subdomain
  // split (lib/domains.ts) is configured, so these resolve directly instead
  // of bouncing through a middleware redirect; plain relative paths
  // otherwise (unchanged single-domain behavior).
  const publicItems: NavItem[] = [
    { label: "Books & Studies", href: marketingUrl("/books") },
    { label: "Blog", href: marketingUrl("/blog") },
  ];
  const loggedInItems: NavItem[] = [{ label: "My Library", href: appUrl("/library") }];

  return (
    // REAL FIX (qa/findings/FINDINGS_2026-11-07.md #1): at a 375px mobile
    // width, this nav previously overflowed the viewport with NO way to
    // reach Cart/My Library/Profile at all -- confirmed
    // document.documentElement.scrollWidth === clientWidth, no scroll
    // anywhere on the page. Fixed with the same overflow-x-auto +
    // no-scrollbar treatment AdminNav.tsx already uses (overflow-x-auto on
    // an element is also what lets it shrink below its own content's width
    // inside a flex row in the first place -- a non-"visible" overflow value
    // makes the browser treat its min-content size as zero for flex sizing).
    // Scoped to an INNER wrapper around everything except Profile, not the
    // whole <nav>: Profile's dropdown is `absolute`-positioned off a
    // `relative` ancestor, which an `overflow-x-auto` ancestor would clip --
    // keeping Profile as a flex-shrink-0 sibling outside the scrollable
    // region means it (and Account/Admin/Log out inside its menu) is always
    // reachable and its dropdown is never cut off, while the less-critical
    // items can scroll if they don't fit.
    <nav aria-label="Primary" className="flex items-center gap-4 sm:gap-6 font-sans text-sm font-medium min-w-0">
      <div
        className="no-scrollbar flex items-center gap-4 sm:gap-6 overflow-x-auto whitespace-nowrap min-w-0"
        style={{ scrollbarWidth: "none" }}
      >
        {publicItems.map((item) => (
          <Link key={item.href} href={item.href} className={linkClass}>
            {item.label}
          </Link>
        ))}
        <CartLink />
        {!loggedIn && (
          <Link href="/login" className={linkClass}>
            Log in
          </Link>
        )}

        {loggedIn && (
          <>
            {/* Vertical spacer between the non-logged-in and logged-in items. */}
            <div aria-hidden="true" className="w-px h-5 bg-parchment/20 flex-shrink-0" />
            {loggedInItems.map((item) => (
              <Link key={item.href} href={item.href} className={linkClass}>
                {item.label}
              </Link>
            ))}
          </>
        )}
      </div>

      {loggedIn && (
        <div className="relative flex-shrink-0" ref={profileRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((o) => !o)}
            className={`${linkClass} flex items-center gap-1 min-h-[44px]`}
          >
            Profile
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`w-4 h-4 transition-transform ${profileOpen ? "rotate-180" : ""}`}
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          {profileOpen && (
            <div
              role="menu"
              aria-label="Profile"
              className="absolute right-0 mt-2 w-44 bg-ink border border-parchment/15 rounded-lg shadow-lg py-1 z-10"
            >
                <Link
                  href={appUrl("/account")}
                  role="menuitem"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center min-h-[44px] px-4 text-parchment/90 hover:bg-parchment/10 hover:text-gold focus:outline-none focus:text-gold"
                >
                  Account
                </Link>
                {isAdmin && (
                  <Link
                    href={marketingUrl("/admin/products")}
                    role="menuitem"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center min-h-[44px] px-4 text-parchment/90 hover:bg-parchment/10 hover:text-gold focus:outline-none focus:text-gold"
                  >
                    Admin
                  </Link>
                )}
                <button
                  type="button"
                  role="menuitem"
                  disabled={loggingOut}
                  onClick={handleLogOut}
                  className="flex items-center w-full min-h-[44px] px-4 text-parchment/90 hover:bg-parchment/10 hover:text-gold focus:outline-none focus:text-gold disabled:opacity-50"
                >
                  {loggingOut ? "Logging out..." : "Log out"}
                </button>
              </div>
            )}
          </div>
      )}
    </nav>
  );
}

