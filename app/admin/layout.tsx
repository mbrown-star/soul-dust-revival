import { requireAdmin } from "@/lib/admin/guard";
import { redirect } from "next/navigation";
import { SiteHeaderShell } from "@/components/marketing/SiteHeaderShell";
import { AdminNav } from "@/components/admin/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  if (!session) redirect("/login?next=/admin/products");

  return (
    <div>
      {/* Same shell as the public site header -- logo/wordmark (routes home),
          sizing, and bg-ink color -- so the admin area can't drift from the
          rest of the site's nav bar. See SiteHeaderShell.tsx. */}
      <SiteHeaderShell>
        <AdminNav />
      </SiteHeaderShell>
      {/* max-w-5xl matches the public site's standard content width (see
          CLAUDE.md's page-width rule) -- was max-w-4xl, its own narrower
          exception, until 2026-11-05, when it was dropped in favor of
          consistency with the rest of the site (this is what the earlier
          admin-table scrollbar question was really pointing at). */}
      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10">{children}</div>
    </div>
  );
}
