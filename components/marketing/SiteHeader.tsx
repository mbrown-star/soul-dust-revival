import { SiteHeaderShell } from "./SiteHeaderShell";
import { SiteNav } from "./SiteNav";
import { getSession } from "@/lib/auth/session";
import { getRoleForSession } from "@/lib/admin/guard";

export async function SiteHeader() {
  const session = await getSession();
  // Display-only -- deciding whether to show an "Admin" link, not gating
  // anything (every /admin route still enforces its own requireAdmin()).
  const role = await getRoleForSession(session);

  return (
    <SiteHeaderShell>
      <SiteNav loggedIn={!!session} isAdmin={role === "admin"} />
    </SiteHeaderShell>
  );
}
