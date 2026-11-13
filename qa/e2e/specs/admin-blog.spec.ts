import { test, expect } from "@playwright/test";

test.describe("admin blog list, as qa-admin", () => {
  test.use({ storageState: "qa/.auth/admin.json" });

  test("list shows both QA fixture posts with correct published/draft state", async ({ page }) => {
    await page.goto("/admin/blog");
    const published = page.getByRole("link", { name: /QA Fixture: Published Post/i });
    const draft = page.getByRole("link", { name: /QA Fixture: Draft Post/i });
    await expect(published).toBeVisible();
    await expect(draft).toBeVisible();
    await expect(draft).toContainText("Draft");
    await expect(published).toContainText("Published");
    // Audit 2026-11-13: each row shows its date too.
    await expect(published).toContainText(/[A-Z][a-z]+ \d{1,2}, \d{4}/);
  });

  test("opening the published post's editor shows its real sanitized-but-rich body", async ({ page }) => {
    await page.goto("/admin/blog");
    await page.getByRole("link", { name: /QA Fixture: Published Post/i }).click();
    await expect(page).toHaveURL(/\/admin\/blog\/[0-9a-f-]+$/);
    // The fixture body includes a <strong> and a real <a> link -- the rich
    // text editor should reflect formatted content, not raw HTML tags shown
    // as literal text.
    await expect(page.locator("body")).not.toContainText("<strong>");
    await expect(page.locator("body")).not.toContainText("<a href");
  });
});
