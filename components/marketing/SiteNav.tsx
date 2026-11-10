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
// Shared row styling for an item inside a dropdown panel (Profile, or the
// mobile hamburger menu) -- a block-level row with its own padding and hit
// area, as opposed to linkClass's inline text treatment.
const menuItemClass =
  "flex items-center min-h-[44px] px-4 text-parchment/90 hover:bg-parchment/10 hover:text-gold focus:outline-none focus:text-gold";

// Closes a dropdown/menu on an outside click or Escape -- shared by the
// Profile dropdown and the mobile hamburger menu below, which would
// otherwise each need the identical pointerdown/keydown wiring. Takes the
// state setter directly (not a generic callback) so it can stay out of the
// effect's own deps safely: a useState setter is referentially stable across
// renders, the same way the original single-menu version of this effect
// relied on without needing an eslint-disable.
function useDismissibleMenu(open: boolean, setOpen: (open: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, setOpen]);

  return ref;
}

export function SiteNav({ loggedIn, isAdmin = false }: { loggedIn: boolean; isAdmin?: boolean }) {
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const profileRef = useDismissibleMenu(profileOpen, setProfileOpen);
  const mobileMenuRef = useDismissibleMenu(mobileMenuOpen, setMobileMenuOpen);

  // Same sign-out sequence as AccountPageClient.tsx: clear the Supabase
  // session client-side, then refresh so every server-rendered bit of the
  // page (this nav included) re-fetches with no session. Closes whichever
  // menu this was triggered from -- the button renders in both.
  async function handleLogOut() {
    setLoggingOut(true);
    setProfileOpen(false);
    setMobileMenuOpen(false);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    // marketingUrl, not a bare "/" -- logging out from the app domain should
    // land on the real marketing homepage directly, not bounce through a
    // middleware redirect from the app domain's own "/".
    router.push(marketingUrl("/"));
    router.refresh();
  }

  // Public items (visible to every visitor) sit at the left on desktop, and
  // first in the mobile menu. Items that only make sense once signed in sit
  // at the far right / further down, set off by a divider.
  // marketingUrl/appUrl -- absolute cross-domain links once the subdomain
  // split (lib/domains.ts) is configured, so these resolve directly instead
  // of bouncing through a middleware redirect; plain relative paths
  // otherwise (unchanged single-domain behavior).
  const publicItems: NavItem[] = [
    { label: "Store", href: marketingUrl("/books") },
    { label: "Blog", href: marketingUrl("/blog") },
  ];
  // "App" (was "My Library") -- the one link into the gated reading app
  // (library, studies, devotionals), named generically since it's the same
  // front door regardless of what a given account actually owns.
  const loggedInItems: NavItem[] = [{ label: "App", href: appUrl("/library") }];

  return (
    <nav aria-label="Primary" className="flex items-center font-sans text-sm font-medium min-w-0">
      {/* Desktop / tablet: the full horizontal layout, unchanged from before
          the hamburger menu existed. overflow-x-auto is kept as a safety net
          at tablet widths, same reasoning as before -- the hamburger below
          is what actually fixed the real mobile-width problem. */}
      <div className="hidden sm:flex items-center gap-4 sm:gap-6 min-w-0">
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
                  className={menuItemClass}
                >
                  Account
                </Link>
                {isAdmin && (
                  <Link
                    href={marketingUrl("/admin/products")}
                    role="menuitem"
                    onClick={() => setProfileOpen(false)}
                    className={menuItemClass}
                  >
                    Admin
                  </Link>
                )}
                <button
                  type="button"
                  role="menuitem"
                  disabled={loggingOut}
                  onClick={handleLogOut}
                  className={`${menuItemClass} w-full disabled:opacity-50`}
                >
                  {loggingOut ? "Logging out..." : "Log out"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile: a single hamburger menu replacing the old scrollable strip.
          REAL FIX: that strip scrolled correctly once the items didn't fit
          (qa/findings/FINDINGS_2026-11-07.md #1), but gave no visual hint
          that there was anything to scroll to -- "App" (then "My Library")
          could land fully off-screen with nothing on screen suggesting it
          existed. One menu with everything in it (links, Cart, Account/
          Admin/Log out) removes the scrolling entirely instead of just
          making it reachable. */}
      <div className="sm:hidden relative flex-shrink-0" ref={mobileMenuRef}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileMenuOpen((o) => !o)}
          className="flex items-center justify-center w-11 h-11 -mr-1 text-parchment/80 hover:text-gold focus:outline-none focus:text-gold"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            {mobileMenuOpen ? (
              <path d="M5 5l10 10M15 5 5 15" />
            ) : (
              <>
                <path d="M3 5.5h14" />
                <path d="M3 10h14" />
                <path d="M3 14.5h14" />
              </>
            )}
          </svg>
        </button>

        {mobileMenuOpen && (
          <div
            role="menu"
            aria-label="Menu"
            className="absolute right-0 mt-2 w-60 bg-ink border border-parchment/15 rounded-lg shadow-lg py-1 z-10"
          >
            {publicItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setMobileMenuOpen(false)}
                className={menuItemClass}
              >
                {item.label}
              </Link>
            ))}
            <div role="menuitem" onClick={() => setMobileMenuOpen(false)} className={menuItemClass}>
              <CartLink />
            </div>

            <div aria-hidden="true" className="h-px bg-parchment/15 my-1" />

            {!loggedIn && (
              <Link href="/login" role="menuitem" onClick={() => setMobileMenuOpen(false)} className={menuItemClass}>
                Log in
              </Link>
            )}

            {loggedIn && (
              <>
                {loggedInItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setMobileMenuOpen(false)}
                    className={menuItemClass}
                  >
                    {item.label}
                  </Link>
                ))}
                <Link
                  href={appUrl("/account")}
                  role="menuitem"
                  onClick={() => setMobileMenuOpen(false)}
                  className={menuItemClass}
                >
                  Account
                </Link>
                {isAdmin && (
                  <Link
                    href={marketingUrl("/admin/products")}
                    role="menuitem"
                    onClick={() => setMobileMenuOpen(false)}
                    className={menuItemClass}
                  >
                    Admin
                  </Link>
                )}
                <button
                  type="button"
                  role="menuitem"
                  disabled={loggingOut}
                  onClick={handleLogOut}
                  className={`${menuItemClass} w-full disabled:opacity-50`}
                >
                  {loggingOut ? "Logging out..." : "Log out"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
