import { SiteHeaderShell } from "./SiteHeaderShell";
import { SiteNav } from "./SiteNav";
import { getSession, type Session } from "@/lib/auth/session";
import { getRoleForSession } from "@/lib/admin/guard";

/**
 * Pass `session` when the layout has already read it (the marketing layout
 * shares it with the footer); leave it out to have the header read it.
 */
export async function SiteHeader({ session: given }: { session?: Session | null } = {}) {
  const session = given === undefined ? await getSession() : given;
  // Display-only -- deciding whether to show an "Admin" link, not gating
  // anything (every /admin route still enforces its own requireAdmin()).
  const role = await getRoleForSession(session);

  return (
    <SiteHeaderShell>
      <SiteNav loggedIn={!!session} isAdmin={role === "admin"} isLeader={role === "leader" || role === "admin"} />
    </SiteHeaderShell>
  );
}
