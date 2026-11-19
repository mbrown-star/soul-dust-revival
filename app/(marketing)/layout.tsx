import { GoogleTag } from "@/components/analytics/GoogleTag";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { getSession } from "@/lib/auth/session";
import { ActivityHeartbeat } from "@/components/study/ActivityHeartbeat";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  // Read once and shared, so the header and footer agree and the page pays
  // for one session check, not two.
  const session = await getSession();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Signed-in time on the website is logged too, as "website" (see
          lib/activity/classifyPath.ts); guests are never tracked. */}
      {session && <ActivityHeartbeat />}
      <SiteHeader session={session} />
      <div className="flex-1">{children}</div>
      <SiteFooter loggedIn={!!session} />
      {/* Analytics on the public site, reading app and leader pages, but not
          /admin (customer emails and orders); see GoogleTag.tsx. */}
      <GoogleTag />
    </div>
  );
}
