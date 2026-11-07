import { test, expect } from "@playwright/test";

test.describe("admin leader resources list, as qa-admin", () => {
  test.use({ storageState: "qa/.auth/admin.json" });

  test("list shows both QA fixtures with correct published/draft state", async ({ page }) => {
    await page.goto("/admin/leader-resources");
    const published = page.getByRole("link", { name: /QA Fixture: Published Leader Resource/i });
    const draft = page.getByRole("link", { name: /QA Fixture: Draft Leader Resource/i });
    await expect(published).toBeVisible();
    await expect(draft).toBeVisible();
    await expect(draft).toContainText("draft");
    await expect(published).not.toContainText("draft");
  });
});

test.describe("public leader resources listing, as qa-leader", () => {
  test.use({ storageState: "qa/.auth/leader.json" });

  test("draft resource never appears on the public /leader listing for a leader-role viewer", async ({ page }) => {
    await page.goto("/leader");
    await expect(page.getByText("QA Fixture: Published Leader Resource")).toBeVisible();
    await expect(page.getByText("QA Fixture: Draft Leader Resource")).toHaveCount(0);
  });
});
