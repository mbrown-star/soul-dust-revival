"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CartLink } from "./CartLink";

type NavItem = { label: string; href: string };

const linkClass =
  "text-parchment/80 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold rounded p-1 -m-1";

export function SiteNav({ loggedIn }: { loggedIn: boolean }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

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

  // Items that only make sense once signed in sit at the far left, set off
  // from the public items (visible to every visitor) by a vertical rule.
  const loggedInItems: NavItem[] = [{ label: "Your Studies", href: "/studies" }];
  const publicItems: NavItem[] = [
    { label: "Books & Studies", href: "/books" },
    { label: "Blog", href: "/blog" },
  ];

  return (
    <nav aria-label="Primary" className="flex items-center gap-4 sm:gap-6 font-sans text-sm font-medium">
      {loggedIn && (
        <>
          {loggedInItems.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass}>
              {item.label}
            </Link>
          ))}
          <div className="relative" ref={profileRef}>
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
                className="absolute left-0 mt-2 w-44 bg-ink border border-parchment/15 rounded-lg shadow-lg py-1 z-10"
              >
                <Link
                  href="/account"
                  role="menuitem"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center min-h-[44px] px-4 text-parchment/90 hover:bg-parchment/10 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold focus:ring-inset"
                >
                  Account
                </Link>
              </div>
            )}
          </div>
          {/* Vertical spacer between the logged-in and public/non-logged-in items. */}
          <div aria-hidden="true" className="w-px h-5 bg-parchment/20" />
        </>
      )}

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
    </nav>
  );
}
