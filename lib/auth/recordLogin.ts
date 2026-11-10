import { getDb } from "@/lib/db/client";
import { users, loginEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Makes sure this Supabase auth user has its own `users` row (same id as the
 * Supabase UID). Safe to call on every request.
 *
 * Returns false when no row with this id could be written -- only possible if
 * a different `users` row already owns the email (a Supabase account deleted
 * and recreated without its old row being removed). Every progress/answer
 * save would then fail the `users` foreign key, so callers that can surface
 * it should.
 */
export async function ensureUserRow({ userId, email }: { userId: string; email: string }): Promise<boolean> {
  const db = await getDb();
  await db.insert(users).values({ id: userId, email }).onConflictDoNothing();
  const row = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true } });
  return !!row;
}

/**
 * A completed sign-in: ensures the `users` row and records one `login_events`
 * row. Called by the emailed-code login's `/api/auth/login-recorded` (the
 * only sign-in path; the old magic-link `/auth/callback` route was removed).
 */
export async function recordLogin({
  userId,
  email,
  userAgent,
}: {
  userId: string;
  email: string;
  userAgent: string | null;
}): Promise<boolean> {
  if (!(await ensureUserRow({ userId, email }))) return false;

  const db = await getDb();
  await db.insert(loginEvents).values({ userId, userAgent });
  return true;
}
