import { test, expect, type Page } from "@playwright/test";

// Fixture: qa-devotional-fixture (slug), 5 days (Jan 1-5). Day 1 completed +
// has a real saved Journal answer; Day 2 in_progress, no answer; Days 3-5
// not started; Days 4-5 have no backfilled question block at all. See
// qa/CONVENTIONS.md's fixture table. Note: the lesson page's "Today" tab
// always shows whichever lesson's URL was loaded -- there is no server-side
// auto-resume inside the lesson page itself (only My Library's "Continue"
// card computes a resume target). This spec navigates to specific days via
// the study's own lesson list rather than assuming which one loads first.
test.describe("Devotional reader", () => {
  test.use({ storageState: "qa/.auth/user.json" });

  async function openDay(page: Page, dayTitleSubstring: string) {
    await page.goto("/studies/qa-devotional-fixture");
    await page.getByRole("link", { name: new RegExp(dayTitleSubstring) }).click();
    await expect(page).toHaveURL(/\/studies\/qa-devotional-fixture\/[^/]+$/);
  }

  test("study listing page shows the real per-day status badges", async ({ page }) => {
    await page.goto("/studies/qa-devotional-fixture");
    await expect(page.getByText("Devotional").first()).toBeVisible(); // kind eyebrow
    await expect(page.getByText("1/5 lessons")).toBeVisible();

    const day1Row = page.getByRole("link", { name: /DAY 1 · JANUARY 1 · PSALM 1/ });
    const day2Row = page.getByRole("link", { name: /DAY 2 · JANUARY 2 · PSALM 2/ });
    const day3Row = page.getByRole("link", { name: /DAY 3 · JANUARY 3 · PSALM 3/ });
    await expect(day1Row.getByText("Completed")).toBeVisible();
    await expect(day2Row.getByText("In progress")).toBeVisible();
    await expect(day3Row.getByText(/Completed|In progress/)).toHaveCount(0); // not_started shows no badge
  });

  test("4-tab shell renders with the correct app title and progress ring", async ({ page }) => {
    await openDay(page, "DAY 1");
    await expect(page.getByRole("heading", { name: "QA Devotional — In Progress", level: 1 })).toBeVisible();

    const tablist = page.getByRole("tablist", { name: "Devotional sections" });
    for (const label of ["Today", "The Year", "Journal", "Six Faces of the Dust"]) {
      await expect(tablist.getByRole("tab", { name: label })).toBeVisible();
    }

    // Ring reads real daysWalked/totalDays -- must read "1" / "OF 5" on
    // every day's page, not just Day 1's, since it's a study-wide figure.
    // (It's a plain aria-labelled <div>, not a form control, so a CSS
    // attribute selector is used rather than getByLabel.)
    const ring = page.locator('div[aria-label="Days walked"]');
    await expect(ring.getByText("1")).toBeVisible();
    await expect(ring.getByText("OF 5")).toBeVisible();
  });

  test("Day 1 (completed) shows the Walked state and its real saved answer in the question block", async ({ page }) => {
    await openDay(page, "DAY 1");
    await expect(page.getByRole("heading", { name: "DAY 1 · JANUARY 1 · PSALM 1", level: 1 })).toBeVisible();
    await expect(page.getByText("PSALM 1:1")).toBeVisible();
    await expect(page.getByText("Lift Up Your Eyes")).toBeVisible();
    await expect(page.getByText("A Question to Sit With")).toBeVisible();

    // Real saved answer, via the backfilled question content block.
    await expect(page.getByRole("textbox")).toHaveValue(
      "A QA fixture saved answer for Day 1 -- should appear in the Journal tab."
    );

    await expect(page.getByRole("button", { name: "✓ Walked" })).toBeVisible();
  });

  test("Day 2 (in progress) shows an unwalked toggle and an empty answer field", async ({ page }) => {
    await openDay(page, "DAY 2");
    await expect(page.getByRole("button", { name: "I walked today" })).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveValue("");
    // Ring is still 1/5 here too -- a global figure, not per-day.
    await expect(page.locator('div[aria-label="Days walked"]').getByText("1")).toBeVisible();
  });

  test("Day 4 (no backfilled question block) shows the plain-text fallback, not a broken/missing section", async ({ page }) => {
    await openDay(page, "DAY 4");
    await expect(page.getByText("A Question to Sit With")).toBeVisible();
    await expect(page.getByText("saving isn't available for this day yet", { exact: false })).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0); // no real input for this day
  });

  test("The Year tab's January grid and stats match the real seeded data", async ({ page }) => {
    await openDay(page, "DAY 1");
    await page.getByRole("tab", { name: "The Year" }).click();

    await expect(page.getByText("1").first()).toBeVisible(); // "days walked" stat tile
    await expect(page.getByText("days walked")).toBeVisible();
    await expect(page.getByText("answers written")).toBeVisible();

    const day1Cell = page.getByRole("link", { name: /Day 1, January 1: Psalm 1, walked/ });
    const day2Cell = page.getByRole("link", { name: /Day 2, January 2: Psalm 2$/ });
    await expect(day1Cell).toBeVisible();
    await expect(day2Cell).toBeVisible();
  });

  test("The Year tab's search finds a day by Psalm number", async ({ page }) => {
    await openDay(page, "DAY 1");
    await page.getByRole("tab", { name: "The Year" }).click();
    // Scoped to the active tabpanel: "DAY 1" also appears in the Today/
    // Journal tabs' own mounted-but-hidden content, which a page-wide count
    // would pick up regardless of the Year grid's own filtered results.
    const panel = page.locator('[role="tabpanel"]:not([hidden])');
    await page.getByRole("searchbox", { name: "Search days" }).fill("3");
    // The day badge and the full day label both separately contain "DAY 3"
    // within the same matched link -- .first() is enough to confirm it's
    // showing.
    await expect(panel.getByText("DAY 3", { exact: false }).first()).toBeVisible();
    await expect(panel.getByText("DAY 1", { exact: false })).toHaveCount(0);
  });

  test("Journal tab shows only Day 1's real answer, newest-first, and nothing for unanswered days", async ({ page }) => {
    await openDay(page, "DAY 1");
    await page.getByRole("tab", { name: "Journal" }).click();
    // Scoped to the active tabpanel: the Today tab's own QuestionBlock
    // textarea (pre-filled with this same saved answer) stays mounted-but-
    // hidden in the DOM, and also contains this exact text.
    const panel = page.locator('[role="tabpanel"]:not([hidden])');

    await expect(panel.getByText(/Day 1 · January 1 · Psalm 1/)).toBeVisible();
    await expect(
      panel.getByText("A QA fixture saved answer for Day 1 -- should appear in the Journal tab.")
    ).toBeVisible();
    // Day 2 has no saved answer yet, Days 4-5 have no question block at all --
    // none should produce a Journal entry.
    await expect(page.getByText(/Day 2 ·/)).toHaveCount(0);
    await expect(page.getByText(/Day 4 ·/)).toHaveCount(0);
  });

  test("Six Faces of the Dust renders the static front-matter content", async ({ page }) => {
    await openDay(page, "DAY 1");
    await page.getByRole("tab", { name: "Six Faces of the Dust" }).click();
    await expect(page.getByRole("heading", { name: "Frailty and Mortality" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "The Christ-Centered Lens" })).toBeVisible();
  });
});
