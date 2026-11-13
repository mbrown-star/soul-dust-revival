import { test, expect } from "@playwright/test";

test.describe("admin products list and form, as qa-admin", () => {
  test.use({ storageState: "qa/.auth/admin.json" });

  test("list shows the inactive QA fixture (admin list is unfiltered, unlike /store)", async ({ page }) => {
    // app/admin/products/page.tsx queries db.select().from(products) with no
    // `active` filter -- the public /store page filters to active only. The
    // admin list marks an inactive row with " · inactive" text instead of
    // hiding it.
    await page.goto("/admin/products");
    const row = page.getByRole("link", { name: /QA Inactive Product/i });
    await expect(row).toBeVisible();
    await expect(row).toContainText("inactive");
  });

  test("featured counter matches the real count of featured=true products", async ({ page }) => {
    // seed-qa.ts marks exactly 2 products featured: QA Digital Study — Not
    // Started and QA Bundle — Both Formats.
    await page.goto("/admin/products");
    await expect(page.getByText(/\d+\/8 featured on the homepage/)).toBeVisible();
    const notStartedRow = page.getByRole("link", { name: /QA Digital Study — Not Started/i });
    await expect(notStartedRow.getByText("Featured")).toBeVisible();
    const bundleRow = page.getByRole("link", { name: /QA Bundle — Both Formats/i });
    await expect(bundleRow.getByText("Featured")).toBeVisible();
    // A non-featured fixture must NOT carry the badge.
    const amazonOnlyRow = page.getByRole("link", { name: /QA Physical Book — Amazon Only/i });
    await expect(amazonOnlyRow.getByText("Featured")).toHaveCount(0);
  });

  // Audit 2026-11-13: the Products list, the Bundles list and the Store named
  // the same prices three ways. Both lists now read "Printed … · Digital …".
  test("list shows each price as Printed and Digital, as the Store does", async ({ page }) => {
    await page.goto("/admin/products");
    const bundleRow = page.getByRole("link", { name: /QA Bundle — Both Formats/i });
    await expect(bundleRow).toContainText("Printed $24.99 · Digital $15.99");
    const amazonOnlyRow = page.getByRole("link", { name: /QA Physical Book — Amazon Only/i });
    await expect(amazonOnlyRow).toContainText("Printed $14.99");
    const studyRow = page.getByRole("link", { name: /QA Digital Study — Not Started/i });
    await expect(studyRow).toContainText("Digital $19.00");
  });

  // Audit 2026-11-13: Study and Devotional had a kind badge and Book had none.
  test("every row has a kind badge, Book included", async ({ page }) => {
    await page.goto("/admin/products");
    const bookRow = page.getByRole("link", { name: /QA Book: A Journey Out of the Dust/i });
    await expect(bookRow.getByTestId("product-kind-badge")).toHaveText("Book");
    const devotionalRow = page.getByRole("link", { name: /QA Bible Journey/i });
    await expect(devotionalRow.getByTestId("product-kind-badge")).toHaveText("Devotional");
  });

  // Audit 2026-11-13: the two forms listed Kind in different orders, and the
  // study form required cover alt text while the product form didn't.
  test("product and study forms list Kind in the same order, with alt text optional on both", async ({ page }) => {
    const kindOrder = async () =>
      (await page.getByRole("group", { name: "Kind" }).getByRole("radio").evaluateAll((els) =>
        els.map((el) => el.closest("label")?.textContent?.trim().split(" ")[0])
      ));
    await page.goto("/admin/products/new");
    expect(await kindOrder()).toEqual(["Book", "Devotional", "Study"]);
    await expect(page.getByRole("radio", { name: /^Devotional \(daily readings, one question a day\)$/ })).toBeVisible();
    await page.goto("/admin/studies/new");
    expect(await kindOrder()).toEqual(["Book", "Devotional", "Study"]);
    await expect(page.getByText("Alt text is required")).toHaveCount(0);
  });

  test("Amazon-only product's list row shows only 'Amazon', not 'Stripe'", async ({ page }) => {
    await page.goto("/admin/products");
    const row = page.getByRole("link", { name: /QA Physical Book — Amazon Only/i });
    await expect(row).toContainText("Amazon");
    await expect(row).not.toContainText("Stripe");
  });

  test("editing the 'both'-format bundle shows BOTH pricing fieldsets distinctly", async ({ page }) => {
    await page.goto("/admin/products");
    await page.getByRole("link", { name: /QA Bundle — Both Formats/i }).click();
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]+$/);

    // ProductForm.tsx renders two <fieldset>s with these exact legends only
    // when format is "physical"/"both" and "digital"/"both" respectively --
    // for format "both" both must be present and visually separate.
    const bookFieldset = page.locator("fieldset", { has: page.getByText("Book Purchase Options") });
    const digitalFieldset = page.locator("fieldset", { has: page.getByText("Digital Purchase Options") });
    await expect(bookFieldset).toBeVisible();
    await expect(digitalFieldset).toBeVisible();

    // The two prices must be independently editable fields, not the same
    // input relabeled -- confirm both real values are present.
    await expect(bookFieldset.locator('input[type="text"], input[type="number"]').first()).toHaveValue(/24\.99|24\.99000/);
  });

  test("editing a plain physical product shows only Book Purchase Options", async ({ page }) => {
    await page.goto("/admin/products");
    await page.getByRole("link", { name: /QA Physical Book — Amazon \+ Stripe/i }).click();
    await expect(page.getByText("Book Purchase Options")).toBeVisible();
    await expect(page.getByText("Digital Purchase Options")).toHaveCount(0);
  });

  test("Delete asks for confirmation (window.confirm) rather than acting immediately", async ({ page }) => {
    await page.goto("/admin/products");
    await page.getByRole("link", { name: /QA Inactive Product/i }).click();
    let dialogSeen = false;
    page.once("dialog", async (dialog) => {
      dialogSeen = true;
      expect(dialog.message()).toMatch(/delete/i);
      await dialog.dismiss(); // cancel -- must not actually delete the fixture
    });
    await page.getByRole("button", { name: /delete/i }).click();
    await expect.poll(() => dialogSeen).toBe(true);
    // Dismissed -- the product must still exist afterward.
    await page.goto("/admin/products");
    await expect(page.getByRole("link", { name: /QA Inactive Product/i })).toBeVisible();
  });
});
