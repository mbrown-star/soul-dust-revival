"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logOut } from "@/lib/auth/logOut";
import { pathMatchesPrefix } from "@/lib/domains";
import { activeNavLinkClass } from "@/lib/ui/navStyles";

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

  // Same shared logOut() as SiteNav.tsx / AccountPageClient.tsx.
  async function handleLogOut() {
    setLoggingOut(true);
    await logOut();
  }

  return (
    // overflow-x-auto lets the nav scroll horizontally on narrow/tablet
    // widths, where these 8 sections plus the divider and Sign out genuinely
    // don't fit regardless of spacing, instead of wrapping into a cramped
    // multi-line stack or overflowing the viewport. The gap is deliberately
    // tighter than the public nav's (gap-4/gap-6) to avoid also triggering
    // at ordinary desktop widths -- but that's a close-margin fix (a few
    // pixels), not a guarantee: a real browser's exact font rendering/zoom
    // can still tip it back into a 1-2px "overflow" that's invisible as
    // content but still shows a scrollbar track. no-scrollbar (same utility
    // CoverGallery.tsx uses) hides that track either way, so it can't show
    // up as a stray sliver next to "Sign out" regardless of those variations.
    <nav
      aria-label="Admin"
      className="no-scrollbar flex items-center gap-2.5 sm:gap-3 pr-1 font-sans text-sm font-medium overflow-x-auto whitespace-nowrap"
      style={{ scrollbarWidth: "none" }}
    >
      {ADMIN_LINKS.map((item) => {
        // /admin/products is also the layout's own redirect target for a
        // bare /admin visit, and every section has sub-routes (e.g.
        // /admin/studies/[id]) that should still highlight their own top-
        // level link, hence pathMatchesPrefix (exact match or subtree)
        // rather than an exact match -- the same "exact or subtree" rule
        // lib/domains.ts uses for the marketing/app domain split, shared
        // rather than reimplemented a second time here.
        const isActive = pathMatchesPrefix(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={isActive ? `${linkClass} ${activeLinkClass}` : linkClass}
          >
            {item.label}
          </Link>
        );
      })}
      <div aria-hidden="true" className="w-px h-5 bg-parchment/20 flex-shrink-0" />
      <button type="button" disabled={loggingOut} onClick={handleLogOut} className={`${linkClass} disabled:opacity-50`}>
        {loggingOut ? "Signing out..." : "Sign out"}
      </button>
    </nav>
  );
}
