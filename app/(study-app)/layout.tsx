import { ActivityHeartbeat } from "@/components/study/ActivityHeartbeat";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { getSession } from "@/lib/auth/session";
import { ensureUserRow } from "@/lib/auth/recordLogin";

export default async function StudyAppLayout({ children }: { children: React.ReactNode }) {
  // Backstop for the sign-in paths' own row creation: if a signed-in reader
  // has no `users` row (the tab closed between verifying the code and
  // /api/auth/login-recorded, or a sign-in path that doesn't call it), create
  // it before any reader page can save progress or answers against it.
  const session = await getSession();
  if (session) await ensureUserRow({ userId: session.userId, email: session.email });

  return (
    <>
      <ActivityHeartbeat />
      <SiteHeader />
      {children}
    </>
  );
}
