import { requireAdmin } from "@/lib/admin/guard";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  if (!session) redirect("/login?next=/admin/products");

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
      {/* overflow-x-auto lets the nav scroll horizontally on narrow phones
          instead of wrapping into a cramped multi-line stack or overflowing
          the viewport; whitespace-nowrap keeps each link on one line. */}
      <nav className="flex gap-4 mb-8 border-b pb-4 overflow-x-auto whitespace-nowrap">
        <Link href="/admin/products" className="font-medium p-2 -m-2">
          Products
        </Link>
        <Link href="/admin/studies" className="font-medium p-2 -m-2">
          Studies
        </Link>
        <Link href="/admin/leader-resources" className="font-medium p-2 -m-2">
          Leader Resources
        </Link>
        <Link href="/admin/blog" className="font-medium p-2 -m-2">
          Blog
        </Link>
        <Link href="/admin/social" className="font-medium p-2 -m-2">
          Social
        </Link>
        <Link href="/admin/users" className="font-medium p-2 -m-2">
          Users
        </Link>
        <Link href="/admin/reports" className="font-medium p-2 -m-2">
          Reports
        </Link>
        <Link href="/admin/settings/connections" className="font-medium p-2 -m-2">
          Settings
        </Link>
      </nav>
      {children}
    </div>
  );
}
