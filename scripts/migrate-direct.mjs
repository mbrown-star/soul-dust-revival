// One-off workaround for a drizzle-kit@0.31.11 bug: its `migrate` CLI command
// swallows the real error from a failed migration and just exits 1 with no
// message at all (see bin.cjs's renderWithTask -> `catch (err2) { terminal.reject(err2); process.exit(1); }`,
// which never prints err2). This calls the same underlying drizzle-orm
// migrator drizzle-kit uses, directly, so real errors are visible.
//
// Usage: node scripts/migrate-direct.mjs (also wired up as `npm run db:migrate`)
import { existsSync } from "node:fs";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const raw = process.env.MIGRATION_DATABASE_URL;
if (!raw) {
  console.error("MIGRATION_DATABASE_URL is not set (check .env.local).");
  process.exit(1);
}
const url = `${raw}${raw.includes("?") ? "&" : "?"}sslmode=no-verify`;

const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = drizzle(pool);

try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied successfully.");
} catch (e) {
  console.error("Migration failed:", e.message);
  if (e.stack) console.error(e.stack);
  process.exitCode = 1;
} finally {
  await pool.end();
}
