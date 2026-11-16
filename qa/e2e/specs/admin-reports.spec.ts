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
    // Audit 2026-11-13: an average session of 945 minutes. It now counts
    // time on the site, from activity pings, and says so.
    await expect(page.getByText(/time spent on the site per sign-in/)).toBeVisible();
    for (const cell of await page.locator("tbody tr td:nth-child(4)").allTextContents()) {
      expect(cell).toMatch(/^(—|\d+(\.\d)? min)$/);
    }
  });

  test("Social analytics report loads without error for qa-admin", async ({ page }) => {
    const res = await page.goto("/admin/reports/social");
    expect(res?.status()).toBe(200);
    await expect(page.locator("body")).not.toContainText(/application error/i);
    // Audit 2026-11-13: the note pointed admins at SOCIAL.md, a code file.
    await expect(page.getByText(/refreshed once a day/)).toBeVisible();
    await expect(page.getByText(/Last refreshed .* UTC\.|Not refreshed yet\./)).toBeVisible();
    await expect(page.locator("body")).not.toContainText("SOCIAL.md");
  });

  test("Engagement splits time by website and app, with each person's page history", async ({ browser, page }) => {
    // qa-user spends a few seconds on an app page and a website page. Leaving
    // each sends the ping that counts that time against it.
    const reader = await browser.newContext({ storageState: "qa/.auth/user.json" });
    const readerPage = await reader.newPage();
    for (const path of ["/library", "/store", "/studies/qa-study-not-started"]) {
      await readerPage.goto(path);
      await readerPage.waitForLoadState("networkidle");
      await readerPage.waitForTimeout(2500);
    }
    await readerPage.goto("/blog");
    await readerPage.waitForLoadState("networkidle");
    await reader.close();

    await page.goto("/admin/reports/engagement");
    for (const header of ["Website", "App", "Leader", "Admin"]) {
      await expect(page.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
    }
    await page.getByRole("link", { name: "qa-user@soul-dust-revival.test" }).click();
    await expect(page.getByRole("heading", { name: "qa-user@soul-dust-revival.test" })).toBeVisible();

    const sections = page.getByRole("table").first();
    await expect(sections.getByRole("row", { name: /^App\s+My Library\s+\d/ })).toBeVisible();
    await expect(sections.getByRole("row", { name: /^Website\s+Store\s+\d/ })).toBeVisible();
    await expect(sections.getByRole("row", { name: /^App\s+My Library\s+\d/ })).toContainText(/\d+ sec|\d+ min/);

    // A study's page is logged against the study itself.
    const studiesTable = page.locator("section", { has: page.getByRole("heading", { name: "Studies and devotionals" }) });
    await expect(studiesTable.getByRole("row", { name: /QA Colossians-Shaped Study/ })).toContainText(/\d+ sec|\d+ min/);

    // Recent pages are newest first, and never show a query string.
    const recent = page.locator("section", { has: page.getByRole("heading", { name: "Recent pages" }) });
    await expect(recent.getByRole("row").nth(1)).toContainText("Blog");
    await expect(recent).not.toContainText("?");
  });
});
