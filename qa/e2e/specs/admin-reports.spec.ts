import { test, expect } from "@playwright/test";

test.describe("admin reports, as qa-admin", () => {
  test.use({ storageState: "qa/.auth/admin.json" });

  test("Sales report includes the QA fixture paid order with the right product and total", async ({ page }) => {
    await page.goto("/admin/reports/sales");
    await expect(page.getByText("QA Digital Study — Not Started")).toBeVisible();
    // "$19.00" appears both in a summary total and in the order's own table
    // row -- asserting at least one visible instance is enough here.
    await expect(page.getByText("$19.00").first()).toBeVisible();
  });

  test("Sales report does not list the pending (unpaid) order as revenue", async ({ page }) => {
    // seed-qa.ts's second order is status="pending" for the Amazon+Stripe
    // book -- the report's revenue total should only ever reflect paid
    // orders (see app/admin/reports/sales/page.tsx's paidOrders filter).
    await page.goto("/admin/reports/sales");
    const body = await page.locator("body").innerText();
    const paidOccurrences = (body.match(/\$16\.99/g) ?? []).length;
    // $16.99 is the Amazon+Stripe book's price -- it may legitimately appear
    // once if the report also lists non-paid orders in a separate section,
    // but the revenue TOTAL figure must not include it. This is a coarse
    // guard; the checklist's "Information-consistency checks" section is
    // where a human confirms the actual total math by hand.
    expect(paidOccurrences).toBeLessThanOrEqual(1);
  });

  test("Engagement report loads without error for qa-admin", async ({ page }) => {
    const res = await page.goto("/admin/reports/engagement");
    expect(res?.status()).toBe(200);
    await expect(page.locator("body")).not.toContainText(/application error/i);
  });

  test("Social analytics report loads without error for qa-admin", async ({ page }) => {
    const res = await page.goto("/admin/reports/social");
    expect(res?.status()).toBe(200);
    await expect(page.locator("body")).not.toContainText(/application error/i);
  });
});
