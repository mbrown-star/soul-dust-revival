import { getSession } from "@/lib/auth/session";
import { requireLeaderOrAdmin } from "@/lib/admin/guard";
import { redirect } from "next/navigation";
import { ActivityHeartbeat } from "@/components/study/ActivityHeartbeat";
import { SiteHeader } from "@/components/marketing/SiteHeader";

export default async function LeaderLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/leader");

  const leaderSession = await requireLeaderOrAdmin();

  // Logged in but not a leader/admin: an inline message, not a bounce back
  // to /login — redirecting an already-authenticated person to the login
  // page reads as broken, since they're not being asked to log in again.
  if (!leaderSession) {
    return (
      <>
      <SiteHeader session={session} />
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="font-serif text-ink">
          This section is for group leaders. If you think you should have access,
          reach out to an admin.
        </p>
      </div>
      </>
    );
  }

  return (
    <>
      <ActivityHeartbeat />
      {/* The same site header as the reading app (staging audit 2026-11-13:
          /leader had no header or nav at all). */}
      <SiteHeader session={session} />
      {children}
    </>
  );
}
