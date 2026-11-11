import { test, expect } from "@playwright/test";

test.describe("My Library / entitlements", () => {
  test("guest is redirected to login from /library", async ({ page }) => {
    await page.goto("/library");
    await expect(page).toHaveURL(/\/login\?next=(%2Flibrary|\/library)/);
  });

  test("/studies redirects to /library (old destination kept as a redirect)", async ({ page }) => {
    const res = await page.goto("/studies");
    expect(res?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/login/); // guest: /library itself then bounces to /login
  });

  test.describe("as qa-user", () => {
    test.use({ storageState: "qa/.auth/user.json" });

    test("shows all three fixtures in the correct buckets", async ({ page }) => {
      await page.goto("/library");

      const continueSection = page.locator("section", { has: page.getByRole("heading", { name: "Continue" }) });
      const notStartedSection = page.locator("section", { has: page.getByRole("heading", { name: "Not started" }) });
      const completedSection = page.locator("section", { has: page.getByRole("heading", { name: "Completed" }) });

      // FIXED (qa/findings/FINDINGS_2026-11-07.md #2): the card now renders
      // the linked product's storefront title via lib/study/displayTitle.ts,
      // not the study's own internal `title` column.
      await expect(continueSection.getByText("QA Devotional — In Progress")).toBeVisible();
      await expect(notStartedSection.getByText("QA Digital Study — Not Started")).toBeVisible();
      await expect(completedSection.getByText("QA Study — Completed")).toBeVisible();

      // Information-consistency: progress fraction shown must match seeded state.
      await expect(continueSection.getByText("1/5")).toBeVisible(); // Day 1 completed of 5
      await expect(notStartedSection.getByText("0/2")).toBeVisible();
      await expect(completedSection.getByText("1/1")).toBeVisible();

      // Button labels follow completed-count, not just bucket name.
      // exact: true -- the product's own display title ("...Not Started")
      // now legitimately contains the substring "Start" too, since the
      // title/product-title fix (#2) above, so a loose match would also hit
      // the card's title link.
      // Scoped to the card -- the seeded free-sample devotional (owned by
      // nobody) also sits under "Not started" with its own Start button.
      const notStartedCard = notStartedSection.locator("div.rounded-xl", { hasText: "QA Digital Study — Not Started" });
      await expect(notStartedCard.getByRole("link", { name: "Start", exact: true })).toBeVisible();
      await expect(continueSection.getByRole("link", { name: "Continue" })).toBeVisible();
      await expect(completedSection.getByRole("link", { name: "Review" })).toBeVisible();

      // "Start over" only ever appears in the Completed section.
      await expect(completedSection.getByRole("button", { name: /start over/i })).toBeVisible();
      await expect(continueSection.getByRole("button", { name: /start over/i })).toHaveCount(0);
      await expect(notStartedSection.getByRole("button", { name: /start over/i })).toHaveCount(0);
    });

    test("clicking a gated study slug that isn't entitled yet redirects to its product page, not a generic error", async ({ page }) => {
      // qa-bundle-study is real/published but qa-user has no entitlement to its
      // linked product (qa-bundle-both-formats) yet -- see qa/CONVENTIONS.md.
      const res = await page.goto("/studies/qa-bundle-study");
      expect(res?.status()).toBeLessThan(400);
      await expect(page).toHaveURL(/\/store\/qa-bundle-both-formats/);
    });
  });

  test.describe("as qa-leader (no entitlements seeded)", () => {
    test.use({ storageState: "qa/.auth/leader.json" });

    test("My Library has only the free sample -- role alone grants no study access", async ({ page }) => {
      await page.goto("/library");
      // The seeded free-sample devotional shows for every account that
      // doesn't own it; nothing they'd have to buy does.
      await expect(page.getByText("QA Sample Devotional")).toBeVisible();
      await expect(page.getByText(/Sneak peek/)).toBeVisible();
      await expect(page.getByText("QA Digital Study — Not Started")).toHaveCount(0);
      await expect(page.getByText("QA Devotional — In Progress")).toHaveCount(0);
      await expect(page.getByText("QA Study — Completed")).toHaveCount(0);
    });

    test("visiting an entitled-only study directly redirects to the purchase page, not a 403", async ({ page }) => {
      const res = await page.goto("/studies/qa-study-not-started");
      expect(res?.status()).toBeLessThan(400);
      await expect(page).toHaveURL(/\/store\/qa-digital-study-not-started/);
    });

    test("visiting an entitled-only lesson directly also redirects to the purchase page", async ({ page }) => {
      // A lesson id that doesn't exist goes back to the study's page, which
      // (no entitlement, no free sample) sends the visitor on to the product.
      const res = await page.goto("/studies/qa-study-not-started/00000000-0000-0000-0000-000000000000");
      expect(res?.status()).toBeLessThan(400);
      await expect(page).toHaveURL(/\/store\/qa-digital-study-not-started/);
    });
  });
});
