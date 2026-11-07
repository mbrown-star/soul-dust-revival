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

      // REAL FINDING (confirmed by reading components/study/LibraryCard.tsx
      // and app/(study-app)/library/page.tsx): the card renders the STUDY's
      // own `title` column, never the linked product's storefront title --
      // the library query doesn't even join products. This is the same
      // underlying problem CLAUDE.md already documents for the public
      // /studies/[slug] page (the real Psalms devotional's raw-filename
      // title leaking through), just confirmed here to be broader: it also
      // affects My Library, not just that one page. A customer who bought
      // "QA Devotional — In Progress" sees "QA Devotional Fixture" here
      // instead -- asserting the real (confirmed, not-yet-fixed) behavior,
      // not the product title a reader would expect.
      await expect(continueSection.getByText("QA Devotional Fixture")).toBeVisible();
      await expect(notStartedSection.getByText("QA Colossians-Shaped Study")).toBeVisible();
      await expect(completedSection.getByText("QA Completed Study")).toBeVisible();

      // Information-consistency: progress fraction shown must match seeded state.
      await expect(continueSection.getByText("1/5")).toBeVisible(); // Day 1 completed of 5
      await expect(notStartedSection.getByText("0/2")).toBeVisible();
      await expect(completedSection.getByText("1/1")).toBeVisible();

      // Button labels follow completed-count, not just bucket name.
      await expect(notStartedSection.getByRole("link", { name: "Start" })).toBeVisible();
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
      await expect(page).toHaveURL(/\/books\/qa-bundle-both-formats/);
    });
  });

  test.describe("as qa-leader (no entitlements seeded)", () => {
    test.use({ storageState: "qa/.auth/leader.json" });

    test("My Library is empty -- role alone grants no study access", async ({ page }) => {
      await page.goto("/library");
      await expect(page.getByText("You don't have any studies or devotionals yet.")).toBeVisible();
      // Real study titles (see the note above on title/product mismatch) --
      // checking these rather than the product titles so an absence here
      // actually exercises the render path, not just a string that was
      // never going to match regardless.
      await expect(page.getByText("QA Colossians-Shaped Study")).toHaveCount(0);
      await expect(page.getByText("QA Devotional Fixture")).toHaveCount(0);
      await expect(page.getByText("QA Completed Study")).toHaveCount(0);
    });

    test("visiting an entitled-only study directly redirects to the purchase page, not a 403", async ({ page }) => {
      const res = await page.goto("/studies/qa-study-not-started");
      expect(res?.status()).toBeLessThan(400);
      await expect(page).toHaveURL(/\/books\/qa-digital-study-not-started/);
    });

    test("visiting an entitled-only lesson directly also redirects to the purchase page", async ({ page }) => {
      // Any lessonId works for this check -- the entitlement gate runs before
      // the lesson is even looked up, per app/(study-app)/studies/[slug]/[lessonId]/page.tsx.
      const res = await page.goto("/studies/qa-study-not-started/00000000-0000-0000-0000-000000000000");
      expect(res?.status()).toBeLessThan(400);
      await expect(page).toHaveURL(/\/books\/qa-digital-study-not-started/);
    });
  });
});
