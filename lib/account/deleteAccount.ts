import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users, responses, loginEvents, entitlements, lessonProgress, journeyEnrollments } from "@/lib/db/schema";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Deletes an account: the person's own request (/api/account/delete) and an
 * admin's (/admin/users) both come here. Callers check who may be deleted.
 *
 * Saved answers, progress, access and login history are deleted outright.
 * The `users` row is deleted too when nothing else points at it; when
 * something must be kept (orders, which have their own retention needs --
 * see PRIVACY.md -- or a blog/social post they wrote) the row is anonymized
 * instead, since deleting it would break those rows' foreign key. Either
 * way the Supabase auth account is deleted, which is what ends sign-in.
 */

const ANONYMIZED_EMAIL_DOMAIN = "deleted.invalid";

export function anonymizedEmail(userId: string): string {
  return `deleted-${userId}@${ANONYMIZED_EMAIL_DOMAIN}`;
}

/** SQL condition matching an anonymized (deleted) account's row, for hiding them from lists. */
export function isAnonymizedEmailSql() {
  return sql`${users.email} like ${`deleted-%@${ANONYMIZED_EMAIL_DOMAIN}`}`;
}

const FOREIGN_KEY_VIOLATION = "23503";

function isForeignKeyViolation(err: unknown): boolean {
  // Drizzle wraps the pg error; check both it and its cause.
  for (let e: unknown = err, depth = 0; e && depth < 3; depth++) {
    if (typeof e === "object" && (e as { code?: unknown }).code === FOREIGN_KEY_VIOLATION) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

export type DeleteAccountResult = {
  usersRow: "removed" | "anonymized";
  // false when the Supabase auth account couldn't be deleted (the app-side
  // data is already gone by then).
  authDeleted: boolean;
};

export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  const usersRow = await clearAppData(userId);

  const serviceClient = createSupabaseServiceRoleClient();
  const { error } = await serviceClient.auth.admin.deleteUser(userId);
  // 404: no auth account left to delete, which is the goal.
  const authDeleted = !error || error.status === 404;
  if (!authDeleted) console.error("deleteAccount: Supabase auth deletion failed:", error?.message);

  // The session check recreates a signed-in account's missing `users` row
  // (lib/auth/session.ts). A request from this account already in flight
  // between the clear above and the login's deletion (another tab's activity
  // ping, say) could have put the row back. Now that no session can, clear
  // once more.
  if (authDeleted && usersRow === "removed") await clearAppData(userId);

  return { usersRow, authDeleted };
}

/** Deletes the account's app data and its `users` row, or anonymizes the row when something must keep pointing at it. */
async function clearAppData(userId: string): Promise<DeleteAccountResult["usersRow"]> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.delete(responses).where(eq(responses.userId, userId));
    await tx.delete(loginEvents).where(eq(loginEvents.userId, userId));
    await tx.delete(entitlements).where(eq(entitlements.userId, userId));
    await tx.delete(lessonProgress).where(eq(lessonProgress.userId, userId));
    await tx.delete(journeyEnrollments).where(eq(journeyEnrollments.userId, userId));

    // In a savepoint, so a foreign-key refusal rolls back only this delete.
    try {
      await tx.transaction(async (sp) => {
        await sp.delete(users).where(eq(users.id, userId));
      });
      return "removed" as const;
    } catch (err) {
      if (!isForeignKeyViolation(err)) throw err;
      await tx
        .update(users)
        .set({ email: anonymizedEmail(userId), fullName: null, country: null, role: "user" })
        .where(eq(users.id, userId));
      return "anonymized" as const;
    }
  });
}
