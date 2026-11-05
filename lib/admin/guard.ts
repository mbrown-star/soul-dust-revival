import { getSession, type Session } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type Role = "admin" | "leader" | "user";

/**
 * Looks up the role for an already-fetched session (or null for a logged-out
 * visitor), without re-running the Supabase auth call that getSession()
 * itself makes. Used wherever a caller already has a session and just needs
 * the role for display purposes (e.g. the site nav deciding whether to show
 * an "Admin" link) rather than to gate access -- requireRole/requireAdmin/
 * requireLeaderOrAdmin stay the single source of truth for actual gating.
 */
export async function getRoleForSession(session: Session | null): Promise<Role | null> {
  if (!session) return null;
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  return user?.role ?? null;
}

/**
 * Returns the session + role if the current user's role is one of
 * `allowedRoles`, otherwise null. This is the single place role checks
 * happen — every gated page/route should call this rather than querying
 * `users.role` directly, so the access rule lives in one place.
 */
export async function requireRole(allowedRoles: Role[]) {
  const session = await getSession();
  const role = await getRoleForSession(session);
  if (!session || !role || !allowedRoles.includes(role)) return null;

  return { ...session, role };
}

/** Convenience wrapper — full admin UI, role management, reporting. */
export async function requireAdmin() {
  return requireRole(["admin"]);
}

/** Leader resource section — leaders and admins both get in. */
export async function requireLeaderOrAdmin() {
  return requireRole(["admin", "leader"]);
}
