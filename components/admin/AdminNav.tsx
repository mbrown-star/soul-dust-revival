"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Same focus/hover treatment as the public SiteNav's linkClass -- no ring,
// just a color change, so the two nav bars read as one system.
const linkClass = "text-parchment/80 hover:text-gold focus:outline-none focus:text-gold p-1 -m-1";

const ADMIN_LINKS = [
  { label: "Products", href: "/admin/products" },
  { label: "Studies", href: "/admin/studies" },
  { label: "Leader Resources", href: "/admin/leader-resources" },
  { label: "Blog", href: "/admin/blog" },
  { label: "Social", href: "/admin/social" },
  { label: "Users", href: "/admin/users" },
  { label: "Reports", href: "/admin/reports" },
  { label: "Settings", href: "/admin/settings/connections" },
];

export function AdminNav() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  // Same sign-out sequence as SiteNav.tsx / AccountPageClient.tsx.
  async function handleLogOut() {
    setLoggingOut(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    // overflow-x-auto lets the nav scroll horizontally on narrow/tablet
    // widths, where these 8 sections plus the divider and Log out genuinely
    // don't fit regardless of spacing, instead of wrapping into a cramped
    // multi-line stack or overflowing the viewport. The gap is deliberately
    // tighter than the public nav's (gap-4/gap-6) so this doesn't also
    // trigger at ordinary desktop widths, where it previously overflowed by
    // a few stray pixels of gap rounding and showed a scrollbar for no real
    // reason -- confirmed against the container's own max-w-5xl width.
    <nav
      aria-label="Admin"
      className="flex items-center gap-2.5 sm:gap-3 pr-1 font-sans text-sm font-medium overflow-x-auto whitespace-nowrap"
    >
      {ADMIN_LINKS.map((item) => (
        <Link key={item.href} href={item.href} className={linkClass}>
          {item.label}
        </Link>
      ))}
      <div aria-hidden="true" className="w-px h-5 bg-parchment/20 flex-shrink-0" />
      <button type="button" disabled={loggingOut} onClick={handleLogOut} className={`${linkClass} disabled:opacity-50`}>
        {loggingOut ? "Logging out..." : "Log out"}
      </button>
    </nav>
  );
}
