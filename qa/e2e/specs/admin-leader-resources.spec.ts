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

  // Audit 2026-11-13: the heading's case, an add button instead of the
  // other sections' "+ New …" link, and an edit form with no Save or Delete.
  test("adds a resource from its own page, saves it, and deletes it", async ({ page }) => {
    await page.goto("/admin/leader-resources");
    await expect(page.getByRole("heading", { name: "Leader Resources", level: 1 })).toBeVisible();
    await page.getByRole("link", { name: "+ New resource" }).click();
    await expect(page).toHaveURL(/\/admin\/leader-resources\/new$/);
    await page.getByLabel("Title").fill("QA Fixture: Temporary Leader Resource");
    await page.getByRole("button", { name: "Create resource" }).click();
    await expect(page).toHaveURL(/\/admin\/leader-resources\/[0-9a-f-]+$/);

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete resource" }).click();
    await expect(page).toHaveURL(/\/admin\/leader-resources$/);
    await expect(page.getByRole("link", { name: /Temporary Leader Resource/ })).toHaveCount(0);
  });
});

test.describe("public leader resources listing, as qa-leader", () => {
  test.use({ storageState: "qa/.auth/leader.json" });

  test("draft resource never appears on the public /leader listing for a leader-role viewer", async ({ page }) => {
    await page.goto("/leader");
    await expect(page.getByText("QA Fixture: Published Leader Resource")).toBeVisible();
    await expect(page.getByText("QA Fixture: Draft Leader Resource")).toHaveCount(0);
  });

  // Audit 2026-11-13: /leader had no site header, and nothing linked to it.
  test("has the site header, and the Profile menu links to it", async ({ page }, testInfo) => {
    await page.goto("/library");
    if (testInfo.project.name === "mobile-chromium") {
      await page.getByRole("button", { name: /menu/i }).click();
    } else {
      await page.getByRole("button", { name: "Profile" }).click();
    }
    await page.getByRole("menuitem", { name: "Leader Resources" }).click();
    await expect(page).toHaveURL(/\/leader$/);
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Leader Resources", level: 1 })).toBeVisible();
  });
});

test.describe("the Profile menu, as qa-user", () => {
  test.use({ storageState: "qa/.auth/user.json" });

  test("has no Leader Resources link for a reader", async ({ page }, testInfo) => {
    await page.goto("/library");
    if (testInfo.project.name === "mobile-chromium") {
      await page.getByRole("button", { name: /menu/i }).click();
    } else {
      await page.getByRole("button", { name: "Profile" }).click();
    }
    await expect(page.getByRole("menuitem", { name: "Account" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Leader Resources" })).toHaveCount(0);
  });
});
