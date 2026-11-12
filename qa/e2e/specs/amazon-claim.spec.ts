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

  test("Buy on Amazon explains the digital edition, emails the claim link, then opens Amazon", async ({ page, context }) => {
    // The reminder route is stubbed: no real email from the QA run (its own
    // rules are covered by app/api/amazon-reminders/route.test.ts).
    let sentBody: { productId?: string; email?: string } | null = null;
    await page.route("**/api/amazon-reminders", async (route) => {
      sentBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok" }) });
    });
    // Amazon itself isn't loaded.
    await context.route("https://www.amazon.com/**", (route) => route.fulfill({ status: 200, body: "Amazon" }));

    await page.goto("/store/qa-amazon-with-study");
    const buy = page.getByRole("button", { name: "Buy on Amazon" });
    await buy.click();
    const dialog = page.getByRole("dialog", { name: "Your book comes with its digital edition" });
    await expect(dialog).toContainText("Amazon doesn't tell us who bought");
    await expect(dialog.getByLabel("Email")).toBeFocused();

    // No email: it says so and stays.
    await dialog.getByRole("link", { name: "Email me the link and continue to Amazon" }).click();
    await expect(dialog.getByRole("alert")).toContainText("valid email");

    await dialog.getByLabel("Email").fill("buyer@soul-dust-revival.test");
    const [amazon] = await Promise.all([
      context.waitForEvent("page"),
      dialog.getByRole("link", { name: "Email me the link and continue to Amazon" }).click(),
    ]);
    expect(amazon.url()).toBe("https://www.amazon.com/dp/QA2222222");
    await amazon.close();
    await expect(dialog.getByRole("status")).toContainText("We've emailed the link to buyer@soul-dust-revival.test");
    expect(sentBody).toMatchObject({ email: "buyer@soul-dust-revival.test" });

    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(buy).toBeFocused();
  });

  test("the Amazon modal closes with Escape and has no axe violations", async ({ page }) => {
    await page.goto("/store/qa-amazon-with-study");
    await page.getByRole("button", { name: "Buy on Amazon" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("link", { name: "Already ordered? Claim it now" })).toHaveAttribute(
      "href",
      "/claim?product=qa-amazon-with-study"
    );
    const violations = await runAxe(page);
    expect(violations, formatViolations(violations)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Buy on Amazon" })).toBeFocused();
  });

  test("a printed book with nothing to read in the app makes no such promise", async ({ page }) => {
    await page.goto("/store/qa-physical-amazon-only");
    await expect(page.locator("body")).toContainText("ships from Amazon");
    await expect(page.locator("body")).not.toContainText("You get both");
    // So Buy on Amazon is a plain link, no modal.
    await expect(page.getByRole("link", { name: "Buy on Amazon" })).toBeVisible();
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
