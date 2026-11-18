import { defineConfig } from "vitest/config";

// The hook tests need no database, so they skip the main config's
// vitest.setup.ts (which requires TEST_DATABASE_URL). `npm run test:hooks`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["qa/hooks/**/*.test.ts"],
    testTimeout: 120_000,
  },
});
