import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { getSession } from "@/lib/auth/session";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  // Read once and shared, so the header and footer agree and the page pays
  // for one session check, not two.
  const session = await getSession();

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader session={session} />
      <div className="flex-1">{children}</div>
      <SiteFooter loggedIn={!!session} />
    </div>
  );
}
