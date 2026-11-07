import { test, expect } from "@playwright/test";

test.describe("QA infra smoke test", () => {
  test("logged-out visitor can reach the homepage", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Soul Dust Revival/i);
  });

  test("logged-out visitor is redirected away from /library", async ({ page }) => {
    const res = await page.goto("/library");
    expect(res?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/login/);
  });

  test.describe("as qa-user", () => {
    test.use({ storageState: "qa/.auth/user.json" });
    test("can reach /library while logged in", async ({ page }) => {
      await page.goto("/library");
      await expect(page).toHaveURL(/\/library/);
      await expect(page.locator("body")).not.toContainText("Log in");
    });
    test("is blocked from /admin/products", async ({ page }) => {
      await page.goto("/admin/products");
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe("as qa-admin", () => {
    test.use({ storageState: "qa/.auth/admin.json" });
    test("can reach /admin/products", async ({ page }) => {
      const res = await page.goto("/admin/products");
      expect(res?.status()).toBe(200);
      await expect(page).toHaveURL(/\/admin\/products/);
    });
  });
});
