import { requireAdmin } from "@/lib/admin/guard";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  if (!session) redirect("/login?next=/admin/products");

  return (
    <div>
      {/* Same color treatment and width as the public site header
          (SiteHeader.tsx) -- sticky, bg-ink, max-w-5xl -- so the admin area
          reads as part of the same site rather than a bolted-on tool. */}
      <header className="sticky top-0 z-40 border-b border-ink/20 bg-ink/95 backdrop-blur-sm">
        {/* overflow-x-auto lets the nav scroll horizontally on narrow phones
            instead of wrapping into a cramped multi-line stack or overflowing
            the viewport; whitespace-nowrap keeps each link on one line. */}
        <nav
          aria-label="Admin"
          className="max-w-5xl mx-auto px-4 py-3 flex gap-4 sm:gap-6 font-sans text-sm font-medium overflow-x-auto whitespace-nowrap"
        >
          <Link href="/admin/products" className={adminLinkClass}>
            Products
          </Link>
          <Link href="/admin/studies" className={adminLinkClass}>
            Studies
          </Link>
          <Link href="/admin/leader-resources" className={adminLinkClass}>
            Leader Resources
          </Link>
          <Link href="/admin/blog" className={adminLinkClass}>
            Blog
          </Link>
          <Link href="/admin/social" className={adminLinkClass}>
            Social
          </Link>
          <Link href="/admin/users" className={adminLinkClass}>
            Users
          </Link>
          <Link href="/admin/reports" className={adminLinkClass}>
            Reports
          </Link>
          <Link href="/admin/settings/connections" className={adminLinkClass}>
            Settings
          </Link>
        </nav>
      </header>
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-10">{children}</div>
    </div>
  );
}

// No ring/box around a focused or just-clicked item -- focus is still
// visible (WCAG 2.4.7), just via the same text-color change already used
// for hover, rather than an outline (matches SiteNav.tsx's treatment).
const adminLinkClass = "text-parchment/80 hover:text-gold focus:outline-none focus:text-gold p-1 -m-1";
