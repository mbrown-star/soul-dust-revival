import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { blockedEmails, users } from "@/lib/db/schema";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Blocking an email, enforced in two independent places:
 *
 * 1. Supabase Auth. The email's auth account is banned, so no sign-in code
 *    for it ever verifies and no session is issued. When the email has no
 *    account (never signed up, or its owner was just deleted), a placeholder
 *    account is created just to hold the ban -- which also stops sign-up,
 *    since sign-up only ever signs in to an existing account for that email.
 * 2. The app. getSession() (lib/auth/session.ts) treats any session whose
 *    email is in `blocked_emails` as signed out, so a session issued before
 *    the block (or one that slipped past step 1) reaches nothing.
 *
 * Step 2 alone is enough to keep someone out of every page and API route;
 * step 1 stops the sign-in itself.
 */

// Supabase has no permanent ban; this is about 100 years.
export const PERMANENT_BAN_DURATION = "876000h";

// listUsers is the only admin lookup by email (there's no getUserByEmail).
// Only used when an email has a Supabase account but no `users` row (someone
// asked for a sign-up code and never entered it). Bounded so a large user
// base can't make one request page through it forever.
const AUTH_LOOKUP_PAGE_SIZE = 1000;
const AUTH_LOOKUP_MAX_PAGES = 10;

const LIST_LIMIT = 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function isEmailBlocked(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const db = await getDb();
  const row = await db.query.blockedEmails.findFirst({
    where: eq(blockedEmails.email, normalizeEmail(email)),
    columns: { id: true },
  });
  return !!row;
}

export type BlockedEmailRow = {
  id: string;
  email: string;
  reason: string | null;
  createdAt: Date | null;
};

export async function listBlockedEmails(): Promise<BlockedEmailRow[]> {
  const db = await getDb();
  return db
    .select({
      id: blockedEmails.id,
      email: blockedEmails.email,
      reason: blockedEmails.reason,
      createdAt: blockedEmails.createdAt,
    })
    .from(blockedEmails)
    .orderBy(desc(blockedEmails.createdAt))
    .limit(LIST_LIMIT);
}

/** The app's own user with this email, if any (emails compared case-insensitively). */
export async function findUserByEmail(email: string) {
  const db = await getDb();
  return db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${normalizeEmail(email)}`,
    columns: { id: true, email: true, role: true },
  });
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const serviceClient = createSupabaseServiceRoleClient();
  for (let page = 1; page <= AUTH_LOOKUP_MAX_PAGES; page++) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: AUTH_LOOKUP_PAGE_SIZE });
    if (error) return null;
    const match = data.users.find((u) => u.email && normalizeEmail(u.email) === email);
    if (match) return match.id;
    if (data.users.length < AUTH_LOOKUP_PAGE_SIZE) return null;
  }
  return null;
}

type AuthBan = { authUserId: string | null; placeholder: boolean; error: string | null };

/** Step 1 above: bans the email's Supabase account, creating a placeholder if it has none. */
async function banInSupabase(email: string, existingUserId: string | null): Promise<AuthBan> {
  const serviceClient = createSupabaseServiceRoleClient();

  async function banExisting(id: string): Promise<AuthBan | null> {
    const { error } = await serviceClient.auth.admin.updateUserById(id, { ban_duration: PERMANENT_BAN_DURATION });
    if (!error) return { authUserId: id, placeholder: false, error: null };
    // A `users` row whose auth account is already gone: fall through and
    // create a placeholder instead.
    if (error.status === 404) return null;
    return { authUserId: null, placeholder: false, error: error.message };
  }

  if (existingUserId) {
    const banned = await banExisting(existingUserId);
    if (banned) return banned;
  }

  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    email_confirm: true,
    ban_duration: PERMANENT_BAN_DURATION,
  });
  if (!error && data.user) return { authUserId: data.user.id, placeholder: true, error: null };

  // 422: the email already has an auth account but no `users` row.
  if (error?.status === 422) {
    const authUserId = await findAuthUserIdByEmail(email);
    if (authUserId) {
      const banned = await banExisting(authUserId);
      if (banned) return banned;
    }
  }
  return { authUserId: null, placeholder: false, error: error?.message ?? "Could not ban the sign-in account." };
}

export type BlockResult = {
  row: BlockedEmailRow;
  alreadyBlocked: boolean;
  // Set when the Supabase ban couldn't be applied. The block still holds in
  // the app (step 2), but a sign-in code could still be verified.
  authWarning: string | null;
};

/**
 * Blocks an email. Callers decide who may be blocked (the routes refuse an
 * admin's email and the caller's own); this only does the blocking.
 * Idempotent: blocking an already-blocked email returns the existing row.
 */
export async function blockEmail({
  email,
  reason,
  blockedByUserId,
}: {
  email: string;
  reason?: string | null;
  blockedByUserId: string;
}): Promise<BlockResult> {
  const normalized = normalizeEmail(email);
  const db = await getDb();

  // Row first, so the app-side block holds even if Supabase fails below, and
  // the unique email column settles two admins blocking at once.
  const [inserted] = await db
    .insert(blockedEmails)
    .values({ email: normalized, reason: reason?.trim() || null, blockedByUserId })
    .onConflictDoNothing({ target: blockedEmails.email })
    .returning();

  if (!inserted) {
    const existing = await db.query.blockedEmails.findFirst({ where: eq(blockedEmails.email, normalized) });
    if (!existing) throw new Error("blocked_emails row vanished during block");
    return { row: toRow(existing), alreadyBlocked: true, authWarning: null };
  }

  const existingUser = await findUserByEmail(normalized);
  const ban = await banInSupabase(normalized, existingUser?.id ?? null);
  if (ban.authUserId) {
    await db
      .update(blockedEmails)
      .set({ authUserId: ban.authUserId, authUserIsPlaceholder: ban.placeholder })
      .where(eq(blockedEmails.id, inserted.id));
  }
  if (ban.error) console.error("blockEmail: Supabase ban failed:", ban.error);

  return { row: toRow(inserted), alreadyBlocked: false, authWarning: ban.error };
}

export type UnblockResult = { ok: true } | { ok: false; status: number; message: string };

/**
 * Unblocks an email: deletes the placeholder auth account (or lifts the ban
 * on the person's own account), then removes the row. If Supabase refuses,
 * the row stays so the block and the ban stay in step and the admin can retry.
 */
export async function unblockEmail(id: string): Promise<UnblockResult> {
  const db = await getDb();
  const row = await db.query.blockedEmails.findFirst({ where: eq(blockedEmails.id, id) });
  if (!row) return { ok: false, status: 404, message: "That email isn't blocked." };

  if (row.authUserId) {
    const serviceClient = createSupabaseServiceRoleClient();
    const { error } = row.authUserIsPlaceholder
      ? await serviceClient.auth.admin.deleteUser(row.authUserId)
      : await serviceClient.auth.admin.updateUserById(row.authUserId, { ban_duration: "none" });
    // 404: the auth account is already gone, which is what unblocking wants.
    if (error && error.status !== 404) {
      return { ok: false, status: 502, message: `Couldn't lift the sign-in ban: ${error.message}` };
    }
  }

  await db.delete(blockedEmails).where(eq(blockedEmails.id, id));
  return { ok: true };
}

function toRow(r: typeof blockedEmails.$inferSelect): BlockedEmailRow {
  return { id: r.id, email: r.email, reason: r.reason, createdAt: r.createdAt };
}
