import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { desc, not } from "drizzle-orm";
import { isAnonymizedEmailSql } from "@/lib/account/deleteAccount";

// Shared by app/admin/users/page.tsx and app/api/admin/users/route.ts GET,
// which previously duplicated this exact query. Capped rather than
// unbounded -- this UI is a flat table with no pagination yet, so a true
// page-size limit (e.g. 50) would silently hide admins/leaders beyond it.
// This cap exists purely as a safety net against unbounded growth; add real
// pagination to the UI before the user count gets anywhere near it.
const SAFETY_LIMIT = 1000;

export async function listUsersForAdmin() {
  const db = await getDb();
  return db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      country: users.country,
      createdAt: users.createdAt,
    })
    .from(users)
    // A deleted account kept only for its orders isn't a user any more.
    .where(not(isAnonymizedEmailSql()))
    .orderBy(desc(users.createdAt))
    .limit(SAFETY_LIMIT);
}
