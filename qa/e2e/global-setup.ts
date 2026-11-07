import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { QA_EMAILS, loggedInCookiesForEmail, type QaRole } from "./fixtures/auth";

/**
 * Runs once before the whole suite. Builds one Playwright storage-state JSON
 * per role (qa/.auth/{user,leader,admin}.json) so individual specs can just
 * declare `test.use({ storageState: "qa/.auth/admin.json" })` and start
 * already logged in -- no UI login flow needed per test, and no dependency
 * on real email delivery.
 */
export default async function globalSetup() {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must be set -- see qa/README.md before running the QA suite.");
  }

  const authDir = path.join(__dirname, "..", ".auth");
  if (!existsSync(authDir)) mkdirSync(authDir, { recursive: true });

  const roles: Exclude<QaRole, "guest">[] = ["user", "leader", "admin"];
  for (const role of roles) {
    const email = QA_EMAILS[role];
    const cookies = await loggedInCookiesForEmail(email);
    writeFileSync(
      path.join(authDir, `${role}.json`),
      JSON.stringify({ cookies, origins: [] }, null, 2)
    );
    console.log(`[qa] Logged in as ${role} (${email}) -> qa/.auth/${role}.json`);
  }
}
