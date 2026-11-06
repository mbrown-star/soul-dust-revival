import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Each worker process gets its own pooled DB connection (see
    // lib/db/client.ts's localPool, max: 5) against TEST_DATABASE_URL, a
    // plain local Postgres with no connection pooler in front of it and a
    // default max_connections of 100. Capping concurrent worker processes
    // keeps worst-case connection usage (maxWorkers * pool max) well under
    // that limit -- hit in practice as "sorry, too many clients already"
    // with Vitest's default (one worker per test file, unbounded).
    maxWorkers: 4,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
