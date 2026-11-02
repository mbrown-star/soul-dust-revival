import { existsSync } from "node:fs";
import type { Config } from "drizzle-kit";

// drizzle-kit is a standalone CLI, not run through Next.js, so it never
// picks up .env.local the way `next dev`/`next build` do. Load it here so
// `npm run db:generate`/`db:migrate` work without exporting DATABASE_URL
// by hand first.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
