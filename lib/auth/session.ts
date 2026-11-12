import { sql } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeEmail } from "@/lib/auth/blockedEmails";
import { ensureUserRow } from "@/lib/auth/recordLogin";
import { getDb } from "@/lib/db/client";
import { blockedEmails, users } from "@/lib/db/schema";

export type Session = {
  userId: string;
  email: string;
};

export type SessionResolution =
  | { status: "signed_in"; session: Session }
  | { status: "blocked"; session: Session }
  | { status: "signed_out" };

/**
 * The Supabase session, plus whether its email has been blocked
 * (/admin/users). Only the sign-in route needs to tell "blocked" from
 * "signed out" (to say why); everything else uses getSession().
 */
export async function resolveSession(): Promise<SessionResolution> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "signed_out" };

  const session = { userId: user.id, email: user.email ?? "" };
  const { blocked, hasRow } = await accountState(session);
  if (blocked) return { status: "blocked", session };

  // Self-repair: every signed-in account needs its own `users` row (orders,
  // claims, answers and progress all reference it). The emailed-code sign-in
  // creates it from the browser (/api/auth/login-recorded), and that call can
  // fail -- a phone back from its mail app may send it on a dead connection
  // (a real sign-up was left without a row on 2026-11-12). So any signed-in
  // request makes sure the row exists. It costs no extra query: the blocked
  // check and the row check are one lookup, and a write happens only when the
  // row is missing.
  if (!hasRow && session.email) {
    const ok = await ensureUserRow(session);
    if (!ok) {
      // A different row already owns this email; only a person can sort that
      // out (see recordLogin). Never log the email itself.
      console.error("resolveSession: users row missing and its email belongs to another row", { userId: session.userId });
    }
  }
  return { status: "signed_in", session };
}

/** Whether the email is blocked and whether the account has its `users` row, in one query. */
async function accountState({ userId, email }: Session): Promise<{ blocked: boolean; hasRow: boolean }> {
  const db = await getDb();
  const result = await db.execute<{ blocked: boolean; has_row: boolean }>(sql`
    select
      exists(select 1 from ${blockedEmails} where ${blockedEmails.email} = ${normalizeEmail(email)}) as blocked,
      exists(select 1 from ${users} where ${users.id} = ${userId}) as has_row
  `);
  const row = result.rows[0];
  // An empty email can't be on the blocked list (same as isEmailBlocked).
  return { blocked: !!email && !!row?.blocked, hasRow: !!row?.has_row };
}

/**
 * Real session lookup via Supabase Auth. Works in Server Components,
 * Route Handlers, and Server Actions (relies on cookies()).
 *
 * A blocked email's session counts as signed out, so it reaches no gated
 * page or route even if it was issued before the block. See
 * lib/auth/blockedEmails.ts.
 */
export async function getSession(): Promise<Session | null> {
  const resolved = await resolveSession();
  return resolved.status === "signed_in" ? resolved.session : null;
}
