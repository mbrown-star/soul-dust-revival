import { test, expect } from "@playwright/test";

// Fixture: qa-bible-journey (qa/scripts/seed-qa.ts, Study S6), shaped like A
// 365-Day Journey Through the Bible: labels with no reading ("DAY 1 ·
// JANUARY 1"), each day opening with its readings and title, ending with Lift
// Up Your Eyes and a prayer, no questions. Owned by nobody; qa-admin reads it
// (admins can open any published study) and has walked Day 1.
test.describe("A day-by-day Bible devotional", () => {
  test.use({ storageState: "qa/.auth/admin.json" });

  async function openDay(page: import("@playwright/test").Page, label: string) {
    await page.goto("/studies/qa-bible-journey");
    await page.getByRole("link", { name: new RegExp(label) }).click();
    await expect(page).toHaveURL(/\/studies\/qa-bible-journey\/[^/]+$/);
  }

  test("a day shows its title, readings, Lift Up and prayer as separate parts", async ({ page }) => {
    await openDay(page, "DAY 1 · JANUARY 1");
    await expect(page.getByRole("heading", { name: "In the Beginning", level: 1 })).toBeVisible();
    // Audit 2026-11-13: the tab read "DAY 1 · JANUARY 1 — Soul Dust Revival".
    await expect(page).toHaveTitle(/^Day 1: In the Beginning — /);
    await expect(page.getByText("Today's Readings")).toBeVisible();
    await expect(page.getByText("Genesis 1–2 · Matthew 1:1–12 · Psalm 1", { exact: true })).toBeVisible();
    await expect(page.getByText("A QA reading for day 1.")).toBeVisible();
    await expect(page.getByText("Lift your eyes, day 1.")).toBeVisible();
    await expect(page.getByText("A Prayer to Begin", { exact: true })).toBeVisible();
    await expect(page.getByText("A QA prayer for day 1.")).toBeVisible();
  });

  test("shows only the tabs this book has, and its own heading", async ({ page }) => {
    await openDay(page, "DAY 2 · JANUARY 2");
    const tablist = page.getByRole("tablist", { name: "Devotional sections" });
    await expect(tablist.getByRole("tab")).toHaveText(["Today", "The Year"]);
    await expect(page.getByText("Soul Dust Revival", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Universal Edition/)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "The Promise in the Dark", level: 1 })).toBeVisible();
  });

  test("The Year lists every day with its readings, and searches by day number or book", async ({ page }) => {
    await openDay(page, "DAY 3 · JANUARY 3");
    await page.getByRole("tab", { name: "The Year" }).click();
    const year = page.getByRole("tabpanel").filter({ has: page.getByRole("searchbox", { name: "Search days" }) });

    await expect(year.getByText("days walked")).toBeVisible();
    await expect(year.getByText("days to go")).toBeVisible();
    await expect(year.getByText("answers written")).toHaveCount(0);
    await expect(year.getByText("Answer written")).toHaveCount(0);
    await expect(year.getByText("of 150 psalms")).toHaveCount(0);
    await expect(year.getByRole("heading", { name: "January" })).toBeVisible();
    await expect(year.getByText("1/3")).toBeVisible();
    await expect(year.getByRole("link", { name: "Day 1, January 1: Genesis 1–2 · Matthew 1:1–12 · Psalm 1, walked" })).toBeVisible();
    await expect(year.getByRole("link", { name: "Day 2, January 2: Genesis 3–4 · Matthew 2 · Psalm 2" })).toBeVisible();

    const search = year.getByRole("searchbox", { name: "Search days" });
    await search.fill("3");
    await expect(year.getByRole("link", { name: /DAY 3/ })).toHaveCount(1);
    await expect(year.getByText("January 3 · Genesis 5–6 · Matthew 3 · Psalm 3")).toBeVisible();
    await search.fill("matthew 2");
    await expect(year.getByRole("link", { name: /DAY 2/ })).toHaveCount(1);
    await expect(year.getByRole("link", { name: /DAY 1/ })).toHaveCount(0);
  });
});
