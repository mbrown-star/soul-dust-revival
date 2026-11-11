import { test, expect } from "@playwright/test";

// "Coming soon" titles and printed books whose Amazon link isn't known yet
// (products.comingSoon / products.sellOnAmazon). Fixtures: qa-coming-soon-book
// and qa-amazon-link-pending in qa/scripts/seed-qa.ts. Checkout refusing a
// Coming soon product is covered against the database in
// app/api/checkout/route.test.ts.

test.describe("Coming soon titles, as a visitor", () => {
  test("the store shows Coming soon in place of a price", async ({ page }) => {
    await page.goto("/store");
    const tile = page.getByRole("link", { name: /QA Coming Soon Book/ });
    await expect(tile).toBeVisible();
    await expect(tile).toContainText("Coming soon");
    await expect(tile).not.toContainText("$");
  });

  test("its page says Coming soon and offers no way to buy", async ({ page }) => {
    await page.goto("/store/qa-coming-soon-book");
    await expect(page.getByRole("heading", { level: 1, name: "QA Coming Soon Book" })).toBeVisible();
    await expect(page.getByText("Coming soon", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /buy|add to cart/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Buy on Amazon" })).toHaveCount(0);
    await expect(page.getByText("Coming soon on Amazon")).toHaveCount(0);
    await expect(page.getByText("$0.00")).toHaveCount(0);
  });
});

test.describe("A printed book whose Amazon link isn't known yet", () => {
  test("shows its price, Buy Now, and Coming soon on Amazon instead of the Amazon button", async ({ page }) => {
    await page.goto("/store/qa-amazon-link-pending");
    await expect(page.getByText("$18.99")).toBeVisible();
    await expect(page.getByRole("button", { name: /buy now/i })).toBeVisible();
    await expect(page.getByText("Coming soon on Amazon")).toBeVisible();
    await expect(page.getByRole("link", { name: "Buy on Amazon" })).toHaveCount(0);
  });

  test("a book with its link still shows Buy on Amazon", async ({ page }) => {
    await page.goto("/store/qa-physical-amazon-only");
    await expect(page.getByRole("link", { name: "Buy on Amazon" })).toBeVisible();
    await expect(page.getByText("Coming soon on Amazon")).toHaveCount(0);
  });
});

test.describe("The product form, as qa-admin", () => {
  test.use({ storageState: "qa/.auth/admin.json" });

  async function openProduct(page: import("@playwright/test").Page, title: RegExp) {
    await page.goto("/admin/products");
    await page.getByRole("link", { name: title }).click();
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]+$/);
    await page.waitForLoadState("networkidle");
  }

  test("the list marks Coming soon titles and pending Amazon links", async ({ page }) => {
    await page.goto("/admin/products");
    await expect(page.getByRole("link", { name: /QA Coming Soon Book/ })).toContainText("Coming soon");
    await expect(page.getByRole("link", { name: /QA Amazon Link Pending/ })).toContainText("Amazon (link pending)");
  });

  test("Amazon stays chosen without a link, and Coming soon can be turned on and off", async ({ page }) => {
    await openProduct(page, /QA Amazon Link Pending/);
    const amazon = page.getByRole("checkbox", { name: /Sell via Amazon/ });
    const comingSoon = page.getByRole("checkbox", { name: /Coming soon/ });
    await expect(amazon).toBeChecked();
    await expect(page.getByLabel(/Amazon product URL/)).toHaveValue("");
    await expect(comingSoon).not.toBeChecked();

    // Save it as Coming soon, reload, and confirm both choices stuck.
    await comingSoon.check();
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("checkbox", { name: /Coming soon/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /Sell via Amazon/ })).toBeChecked();

    await page.goto("/store/qa-amazon-link-pending");
    await expect(page.getByText("Coming soon", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /buy now/i })).toHaveCount(0);

    // Put it back on sale.
    await openProduct(page, /QA Amazon Link Pending/);
    await page.getByRole("checkbox", { name: /Coming soon/ }).uncheck();
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  });

  test("a printed book with no route at all can't be saved unless it's Coming soon", async ({ page }) => {
    await openProduct(page, /QA Coming Soon Book/);
    const save = page.getByRole("button", { name: "Save product" });
    await page.getByRole("checkbox", { name: /Sell via Amazon/ }).uncheck();
    await expect(save).toBeEnabled();
    await page.getByRole("checkbox", { name: /Coming soon/ }).uncheck();
    await expect(page.getByText("Enable at least one purchase route.")).toBeVisible();
    await expect(save).toBeDisabled();
  });
});
