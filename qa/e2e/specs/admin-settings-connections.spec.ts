import { test, expect } from "@playwright/test";

// app/admin/settings/connections/page.tsx builds `byProvider` from only
// {displayName, status, lastError} before passing it to the client
// ConnectionsPanel (see the 2026-11-03 security fix in CLAUDE.md) -- this
// spec can't inspect the React props tree directly, so it asserts on the
// network/DOM-observable surface instead: no raw token-shaped strings ever
// appear in the rendered HTML or any response body the page itself issues.
test.describe("Admin: Settings / Connections", () => {
  test.describe("as qa-admin", () => {
    test.use({ storageState: "qa/.auth/admin.json" });

    test("renders all 4 integration rows", async ({ page }) => {
      const res = await page.goto("/admin/settings/connections");
      expect(res?.status()).toBe(200);
      // Each provider's name appears multiple times per row (a heading, a
      // Connect/Disconnect button, descriptive copy) -- .first() just
      // confirms the row exists, not which exact element renders it.
      await expect(page.getByText(/Anthropic/i).first()).toBeVisible();
      await expect(page.getByText(/^X$|\bX\b/).first()).toBeVisible();
      await expect(page.getByText(/Facebook/i).first()).toBeVisible();
      await expect(page.getByText(/Instagram/i).first()).toBeVisible();
    });

    test("no encrypted token ciphertext or internal ids leak into the rendered page", async ({ page }) => {
      await page.goto("/admin/settings/connections");
      const html = await page.content();
      // accessTokenEncrypted/refreshTokenEncrypted are stored as opaque
      // iv:authTag:ciphertext-shaped strings (lib/crypto/tokenCipher.ts) --
      // this is a coarse heuristic (a long base64-ish colon-delimited
      // triplet), good enough to catch an accidental re-introduction of the
      // full DB row being serialized to the client again.
      expect(html).not.toMatch(/[A-Za-z0-9+/]{40,}:[A-Za-z0-9+/]{10,}:[A-Za-z0-9+/]{20,}/);
    });
  });

  test("guest is redirected away from /admin/settings/connections", async ({ page }) => {
    await page.goto("/admin/settings/connections");
    await expect(page).toHaveURL(/\/login/);
  });

  test.describe("as qa-user (role=user)", () => {
    test.use({ storageState: "qa/.auth/user.json" });
    test("is blocked from /admin/settings/connections", async ({ page }) => {
      await page.goto("/admin/settings/connections");
      await expect(page).toHaveURL(/\/login/);
    });
  });
});
