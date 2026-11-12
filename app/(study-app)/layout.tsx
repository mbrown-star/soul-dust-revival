import { ActivityHeartbeat } from "@/components/study/ActivityHeartbeat";
import { SiteHeader } from "@/components/marketing/SiteHeader";

// A signed-in reader's missing `users` row is repaired by the session check
// itself (lib/auth/session.ts), on every page and route, so this layout no
// longer needs its own backstop.
export default function StudyAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ActivityHeartbeat />
      <SiteHeader />
      {children}
    </>
  );
}
