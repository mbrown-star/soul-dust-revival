import { test, expect, type Page } from "@playwright/test";
import { runAxe, formatViolations } from "../fixtures/axe";

// Automated accessibility audit (axe-core) -- this is the thing
// ACCESSIBILITY.md's "Run automated audits regularly" item used to mean
// "someone remembers to do this by hand occasionally." Running it as part
// of the standing QA suite means it can't quietly stop happening. Still a
// floor, not a replacement: ACCESSIBILITY.md's manual-only items (real
// screen reader pass, caption/transcript accuracy, imported-document
// heading structure) aren't things axe-core can check at all.
async function expectNoSeriousViolations(page: Page) {
  const violations = await runAxe(page);
  expect(violations, formatViolations(violations)).toEqual([]);
}

test.describe("axe: public pages (guest)", () => {
  const paths = [
    "/",
    "/store",
    "/store/qa-physical-amazon-and-stripe",
    "/blog",
    "/blog/qa-fixture-published-post",
    "/privacy",
    "/login",
    "/signup",
    "/checkout",
    "/this-page-does-not-exist",
  ];

  for (const path of paths) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await expectNoSeriousViolations(page);
    });
  }
});

test.describe("axe: as qa-user", () => {
  test.use({ storageState: "qa/.auth/user.json" });

  for (const path of ["/account", "/library"]) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await expectNoSeriousViolations(page);
    });
  }

  test("a Study-kind lesson (5-tab reader, every tab)", async ({ page }) => {
    await page.goto("/studies/qa-study-not-started");
    await expectNoSeriousViolations(page);
    await page.getByRole("link", { name: /Week 1: Grace and Truth/ }).click();
    await expect(page).toHaveURL(/\/studies\/qa-study-not-started\/[^/]+$/);

    // Each tab's panel stays mounted-but-hidden when not active
    // (StudyLessonView.tsx) -- axe only sees what's actually visible, so a
    // violation inside a non-default tab is invisible unless the test
    // actually switches to it first.
    const tablist = page.getByRole("tablist", { name: "Week sections" });
    for (const label of ["Study", "Passage", "Work the Word", "Live It", "Lift Up"]) {
      await tablist.getByRole("tab", { name: label }).click();
      await expectNoSeriousViolations(page);
    }
  });

  test("a Devotional-kind lesson (4-tab app shell, every tab)", async ({ page }) => {
    await page.goto("/studies/qa-devotional-fixture");
    await expectNoSeriousViolations(page);
    await page.getByRole("link", { name: /DAY 1/i }).click();
    await expect(page).toHaveURL(/\/studies\/qa-devotional-fixture\/[^/]+$/);

    const tablist = page.getByRole("tablist", { name: "Devotional sections" });
    for (const label of ["Today", "The Year", "Journal", "Six Faces of the Dust"]) {
      await tablist.getByRole("tab", { name: label }).click();
      await expectNoSeriousViolations(page);
    }
  });
});

test.describe("axe: as qa-admin", () => {
  test.use({ storageState: "qa/.auth/admin.json" });

  const paths = [
    "/admin/products",
    "/admin/studies",
    "/admin/blog",
    "/admin/leader-resources",
    "/admin/social",
    "/admin/users",
    "/admin/reports/sales",
    "/admin/settings/connections",
  ];

  for (const path of paths) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await expectNoSeriousViolations(page);
    });
  }

  test("lesson list and block builder (devotional lesson)", async ({ page }) => {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: /QA Devotional Fixture/i }).click();
    await expectNoSeriousViolations(page);
    await page.getByRole("link", { name: /DAY 1/i }).click();
    await expect(page.getByRole("navigation", { name: "Add a block" })).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  // Every tab, since a hidden tab panel is invisible to axe until shown.
  test("week builder (study lesson), every tab", async ({ page }) => {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: /QA Colossians-Shaped Study/i }).click();
    await page.getByRole("link", { name: /Week 1: Grace and Truth/i }).click();
    for (const tab of ["Study", "Passage", "Work the Word", "Live It", "Lift Up"]) {
      await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
      await expectNoSeriousViolations(page);
    }
  });
});
