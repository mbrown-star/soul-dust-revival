import { test, expect } from "@playwright/test";
import { formatViolations, runAxe } from "../fixtures/axe";

// A printed book includes its digital edition (2026-11-11). Bought on Amazon,
// the reader claims it on /claim with the Amazon order number. Fixture:
// qa-amazon-with-study (seed-qa.ts), a printed study on Amazon with a study.
// The claim route's rules (one claim per order number per title, revoking)
// are covered by app/api/amazon-claims/route.test.ts.

test.describe("Product page: printed book on Amazon", () => {
  test("says the digital edition comes with it and links to claim it", async ({ page }) => {
    await page.goto("/store/qa-amazon-with-study");
    await expect(page.locator("body")).toContainText("Buying on Amazon? You get both:");
    await expect(page.locator("body")).toContainText("shipped to you by Amazon");
    await expect(page.locator("body")).toContainText("Its digital edition in the Soul Dust Revival app");
    await expect(page.getByRole("link", { name: "Already ordered? Claim your digital edition" })).toHaveAttribute(
      "href",
      "/claim?product=qa-amazon-with-study"
    );
  });

  test("a printed book with nothing to read in the app makes no such promise", async ({ page }) => {
    await page.goto("/store/qa-physical-amazon-only");
    await expect(page.locator("body")).toContainText("ships from Amazon");
    await expect(page.locator("body")).not.toContainText("You get both");
  });
});

test.describe("/claim", () => {
  test("a guest signs in (or signs up) right on the page first", async ({ page }) => {
    await page.goto("/claim?product=qa-amazon-with-study");
    await expect(page.getByRole("heading", { level: 1, name: "Claim your digital edition" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "First, sign in or create your account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send my code" })).toBeVisible();
  });

  test.describe("as qa-user", () => {
    test.use({ storageState: "qa/.auth/user.json" });

    test("unlocks the book with an order number, and it shows in My Library", async ({ page }) => {
      await page.goto("/claim?product=qa-amazon-with-study");
      await expect(page.getByLabel("Which book did you buy?")).toHaveValue(/.+/);
      await expect(page.locator("body")).toContainText("Claiming for qa-user@soul-dust-revival.test");

      const orderField = page.getByLabel("Amazon order number");
      await orderField.fill("12345");
      await page.getByRole("button", { name: "Unlock my digital edition" }).click();
      await expect(page.getByRole("form", { name: "Claim your digital edition" }).getByRole("alert")).toContainText(
        "doesn't look like an Amazon order number"
      );

      await orderField.fill("113 7654321 7654321");
      await page.getByRole("button", { name: "Unlock my digital edition" }).click();
      await expect(page.getByRole("heading", { name: "Your digital edition is unlocked" })).toBeFocused();

      await page.goto("/library");
      await expect(page.locator("body")).toContainText("QA Printed Study — On Amazon");
    });

    test("has no axe violations", async ({ page }) => {
      await page.goto("/claim");
      const violations = await runAxe(page);
      expect(violations, formatViolations(violations)).toEqual([]);
    });
  });
});
