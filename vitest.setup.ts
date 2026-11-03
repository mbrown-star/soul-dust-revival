import { existsSync } from "node:fs";

// Tests run as plain Node, not through Next.js, so nothing else loads
// .env.local automatically -- same pattern drizzle.config.ts already uses.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
