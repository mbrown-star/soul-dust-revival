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
    // erroring. Append sslmode=require directly to the URL instead.
    url: `${process.env.MIGRATION_DATABASE_URL!}${process.env.MIGRATION_DATABASE_URL!.includes("?") ? "&" : "?"}sslmode=require`,
  },
} satisfies Config;
