"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logOut } from "@/lib/auth/logOut";
import { pathMatchesPrefix } from "@/lib/domains";
import { activeNavLinkClass, navMenuItemActiveClass, navMenuItemClass } from "@/lib/ui/navStyles";
import { useDismissibleMenu } from "@/lib/ui/useDismissibleMenu";

// Same focus/hover treatment as the public SiteNav's linkClass -- no ring,
// just a color change, so the two nav bars read as one system.
const linkClass = "text-parchment/80 hover:text-gold focus:outline-none focus:text-gold p-1 -m-1";
// REAL FIX (qa/findings/FINDINGS_2026-11-07.md #10): the admin nav had no
// active-section indicator at all -- an admin on, say, /admin/blog had no
// visual confirmation of which section they were in.
const activeLinkClass = activeNavLinkClass;

const ADMIN_LINKS = [
  { label: "Products", href: "/admin/products" },
  { label: "Studies", href: "/admin/studies" },
  { label: "Bundles", href: "/admin/bundles" },
  { label: "Leader Resources", href: "/admin/leader-resources" },
  { label: "Blog", href: "/admin/blog" },
  { label: "Social", href: "/admin/social" },
  { label: "Users", href: "/admin/users" },
  { label: "Reports", href: "/admin/reports" },
  { label: "Settings", href: "/admin/settings/connections" },
];

export function AdminNav() {
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useDismissibleMenu(mobileMenuOpen, setMobileMenuOpen);

  // /admin/products is also the layout's own redirect target for a bare
  // /admin visit, and every section has sub-routes (e.g. /admin/studies/[id])
  // that should still highlight their own top-level link, hence
  // pathMatchesPrefix (exact match or subtree) rather than an exact match --
  // the same "exact or subtree" rule lib/domains.ts uses for the
  // marketing/app domain split, shared rather than reimplemented here.
  const isActive = (href: string) => pathMatchesPrefix(pathname, href);

  // Same shared logOut() as SiteNav.tsx / AccountPageClient.tsx.
  async function handleLogOut() {
    setLoggingOut(true);
    setMobileMenuOpen(false);
    await logOut();
  }

  return (
    <nav aria-label="Admin" className="flex items-center font-sans text-sm font-medium min-w-0">
      {/* Desktop / tablet: the horizontal row. overflow-x-auto lets it
          scroll at tablet widths, where these sections plus the divider and
          Sign out genuinely don't fit. The gap is deliberately tighter than
          the public nav's (gap-4/gap-6) to avoid also triggering at ordinary
          desktop widths -- a close-margin fix, so no-scrollbar (same utility
          CoverGallery.tsx uses) hides any 1-2px rounding overflow's track. */}
      <div
        className="no-scrollbar hidden sm:flex items-center gap-2.5 sm:gap-3 pr-1 overflow-x-auto whitespace-nowrap min-w-0"
        style={{ scrollbarWidth: "none" }}
      >
        {ADMIN_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={isActive(item.href) ? `${linkClass} ${activeLinkClass}` : linkClass}
          >
            {item.label}
          </Link>
        ))}
        <div aria-hidden="true" className="w-px h-5 bg-parchment/20 flex-shrink-0" />
        <button type="button" disabled={loggingOut} onClick={handleLogOut} className={`${linkClass} disabled:opacity-50`}>
          {loggingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>

      {/* Mobile: one hamburger menu, same pattern as the public SiteNav's.
          The horizontal strip above used to show at phone widths too, where
          it scrolled sideways inside the sticky header and shifted as the
          page scrolled underneath it. max-h + overflow-y-auto keeps all
          rows reachable on a short (landscape) phone screen. */}
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
            aria-label="Admin menu"
            className="absolute right-0 mt-2 w-60 max-h-[calc(100dvh-5rem)] overflow-y-auto bg-ink border border-parchment/15 rounded-lg shadow-lg py-1 z-10"
          >
            {ADMIN_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                aria-current={isActive(item.href) ? "page" : undefined}
                onClick={() => setMobileMenuOpen(false)}
                className={isActive(item.href) ? navMenuItemActiveClass : navMenuItemClass}
              >
                {item.label}
              </Link>
            ))}
            <div aria-hidden="true" className="h-px bg-parchment/15 my-1" />
            <button
              type="button"
              role="menuitem"
              disabled={loggingOut}
              onClick={handleLogOut}
              className={`${navMenuItemClass} w-full disabled:opacity-50`}
            >
              {loggingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
