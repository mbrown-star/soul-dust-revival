/**
 * One-off repair: gives every Supabase Auth account its own `users` row.
 *
 * From 2026-11-08 (the switch to code-based login) until
 * /api/auth/login-recorded existed, a brand-new signup got a Supabase Auth
 * account but no `users` row -- only /auth/callback created one, and the
 * code flow never reaches it. Those accounts can sign in but every
 * progress/answer save fails the `users` foreign key. This inserts the
 * missing rows (id = the Supabase UID, same as every other path).
 *
 * Dry run by default -- lists what's missing. Pass --apply to insert.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-missing-user-rows.ts [--apply]
 */
import { getDb } from "../lib/db/client";
import { users } from "../lib/db/schema";
import { inArray } from "drizzle-orm";
import { createSupabaseServiceRoleClient } from "../lib/supabase/admin";

const PAGE_SIZE = 1000;

function maskEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const supabase = createSupabaseServiceRoleClient();
  const db = await getDb();

  const authUsers: { id: string; email: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw error;
    for (const u of data.users) authUsers.push({ id: u.id, email: u.email ?? "" });
    if (data.users.length < PAGE_SIZE) break;
  }

  const ids = authUsers.map((u) => u.id);
  const existing =
    ids.length === 0 ? [] : await db.select({ id: users.id }).from(users).where(inArray(users.id, ids));
  const existingIds = new Set(existing.map((r) => r.id));
  const missing = authUsers.filter((u) => !existingIds.has(u.id));

  console.log(`${authUsers.length} auth accounts, ${missing.length} missing a users row.`);
  for (const u of missing) console.log(`  ${u.id}  ${maskEmail(u.email)}`);

  if (!apply || missing.length === 0) {
    console.log(apply ? "Nothing to do." : "\nDry run -- nothing written. Re-run with --apply to insert.");
    return;
  }

  let inserted = 0;
  const conflicts: string[] = [];
  for (const u of missing) {
    const rows = await db.insert(users).values({ id: u.id, email: u.email }).onConflictDoNothing().returning({ id: users.id });
    if (rows.length > 0) inserted++;
    else conflicts.push(u.id);
  }

  console.log(`\n${inserted} inserted.`);
  if (conflicts.length > 0) {
    // Another users row already owns this email under a different id --
    // needs a human decision, not an automatic merge.
    console.error(`${conflicts.length} skipped (email already on a different users row): ${conflicts.join(", ")}`);
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
