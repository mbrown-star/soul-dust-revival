"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CartLink } from "./CartLink";

type NavItem = { label: string; href: string };

const linkClass =
  "text-ink hover:text-moss focus:outline-none focus:ring-2 focus:ring-ink rounded p-1 -m-1";

// Cart is rendered separately below via CartLink (it needs live client-side
// cart state, not a static href) but still counts as one of the 4 visible
// slots -- so only 3 slots are available here before the rest overflow into
// the "More" menu.
const MAX_VISIBLE_LINKS = 3;

export function SiteNav({ loggedIn }: { loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Closes on an outside click or Escape -- a menu that can only be
  // dismissed by clicking exactly the toggle button again is a real
  // usability bug, not an edge case. Following a link inside the menu closes
  // it via that link's own onClick below, rather than watching the route
  // from an effect (which would mean calling setState synchronously on every
  // navigation, including ones that didn't come from this menu at all).
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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
  }, [open]);

  const items: NavItem[] = loggedIn
    ? [
        { label: "Books & Studies", href: "/books" },
        { label: "Blog", href: "/blog" },
        { label: "Your Studies", href: "/studies" },
        { label: "Account", href: "/account" },
      ]
    : [
        { label: "Books & Studies", href: "/books" },
        { label: "Blog", href: "/blog" },
        { label: "Log in", href: "/login" },
      ];

  const visible = items.slice(0, MAX_VISIBLE_LINKS);
  const overflow = items.slice(MAX_VISIBLE_LINKS);

  return (
    <nav aria-label="Primary" className="flex items-center gap-4 sm:gap-6 font-sans text-sm font-medium">
      {visible.map((item) => (
        <Link key={item.href} href={item.href} className={linkClass} onClick={() => setOpen(false)}>
          {item.label}
        </Link>
      ))}
      <CartLink />
      {overflow.length > 0 && (
        <div className="relative" ref={containerRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={`${linkClass} flex items-center gap-1 min-h-[44px]`}
          >
            More
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          {open && (
            <div
              role="menu"
              aria-label="More"
              className="absolute right-0 mt-2 w-44 bg-parchment border border-moss/20 rounded-lg shadow-lg py-1 z-10"
            >
              {overflow.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center min-h-[44px] px-4 text-ink hover:bg-dusk/5 focus:outline-none focus:ring-2 focus:ring-ink focus:ring-inset"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
