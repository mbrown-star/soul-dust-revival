import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type Role = "admin" | "leader" | "user";

/**
 * Returns the session + role if the current user's role is one of
 * `allowedRoles`, otherwise null. This is the single place role checks
 * happen — every gated page/route should call this rather than querying
 * `users.role` directly, so the access rule lives in one place.
 */
export async function requireRole(allowedRoles: Role[]) {
  const session = await getSession();
  if (!session) return null;

  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
  if (!user || !allowedRoles.includes(user.role)) return null;

  return { ...session, role: user.role };
}

/** Convenience wrapper — full admin UI, role management, reporting. */
export async function requireAdmin() {
  return requireRole(["admin"]);
}

/** Leader resource section — leaders and admins both get in. */
export async function requireLeaderOrAdmin() {
  return requireRole(["admin", "leader"]);
}
