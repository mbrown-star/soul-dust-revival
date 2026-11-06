import { existsSync } from "node:fs";
import type { Config } from "drizzle-kit";

// drizzle-kit is a standalone CLI, not run through Next.js, so it never
// picks up .env.local the way `next dev`/`next build` do. Load it here so
// `npm run db:generate`/`db:migrate` work without exporting DATABASE_URL
// by hand first.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

// drizzle-kit's migrate command needs session-level features (advisory locks,
// multi-statement DDL transactions) that Supabase's transaction-mode pooler
// (DATABASE_URL, used by the app at runtime) doesn't support — it hangs
// instead of erroring. Migrations use the session pooler/direct connection
// instead, via a separate env var.
export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // drizzle-kit does not honor a separate `ssl` field once `url` is set —
    // it silently skips SSL and the connection then hangs rather than
    // erroring. Append sslmode directly to the URL instead.
    //
    // Use `no-verify`, not `require`: as of pg-connection-string's current
    // major version, `require` (and `prefer`/`verify-ca`) is treated as an
    // alias for `verify-full`, which validates the server's certificate
    // chain against Node's trusted CA store. Supabase's pooler certificate
    // isn't in that store, so `require` fails with "self-signed certificate
    // in certificate chain" -- and drizzle-kit's migrate command doesn't
    // surface that error, it just hangs forever at "applying migrations...".
    // `no-verify` still encrypts the connection, it just skips the chain
    // check (same effective behavior `require` used to have before that
    // library's semantics changed).
    url: `${process.env.MIGRATION_DATABASE_URL!}${process.env.MIGRATION_DATABASE_URL!.includes("?") ? "&" : "?"}sslmode=no-verify`,
  },
} satisfies Config;
