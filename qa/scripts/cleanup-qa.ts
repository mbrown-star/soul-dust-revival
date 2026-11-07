// Removes the three QA Supabase Auth identities (qa-user@/qa-leader@/qa-
// admin@soul-dust-revival.test) from the real, shared Supabase Auth project.
// Run this when a QA pass is done. Does NOT touch TEST_DATABASE_URL rows --
// re-running qa/scripts/seed-qa.ts already clears and re-creates those, and
// deleting the Postgres rows here would race against a QA run still in
// progress with no benefit.
import { createClient } from "@supabase/supabase-js";

const QA_EMAILS = [
  "qa-user@soul-dust-revival.test",
  "qa-leader@soul-dust-revival.test",
  "qa-admin@soul-dust-revival.test",
];

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set.");
  }
  const admin = createClient(supabaseUrl, serviceKey);

  let page = 1;
  const toDelete: { id: string; email: string }[] = [];
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    for (const u of data.users) {
      if (u.email && QA_EMAILS.includes(u.email)) toDelete.push({ id: u.id, email: u.email });
    }
    if (data.users.length < 200) break;
    page++;
  }

  for (const u of toDelete) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) console.error(`Failed to delete ${u.email}: ${error.message}`);
    else console.log(`Deleted Supabase Auth identity: ${u.email}`);
  }
  if (toDelete.length === 0) console.log("No QA Supabase Auth identities found.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
