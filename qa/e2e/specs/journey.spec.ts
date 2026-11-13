import { test, expect } from "@playwright/test";
import { runAxe, formatViolations } from "../fixtures/axe";

// The Journey: two seeded Parts read as one road (qa/scripts/seed-qa.ts).
// qa-leader has finished Part One; Part Two's threshold is this week's
// stop and Week 3 opens in three days. qa-admin hasn't begun. Tests in this
// file change that state (crossing, beginning), so they run in order and
// the suite reseeds before each run.
test.describe.configure({ mode: "serial" });

const HOME = "/journey/qa-journey";

test.describe("The Journey, as qa-leader", () => {
  test.use({ storageState: "qa/.auth/leader.json" });

  test("My Library shows one Journey card in place of its Parts", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "QA Journey" })).toBeVisible();
    await expect(page.getByText("3/5 weeks")).toBeVisible();
    await expect(page.getByText("This week: Part Two introduction")).toBeVisible();
    await expect(page.getByText("QA Journey Part One")).toHaveCount(0);
    await expect(page.getByText("Part One — Out of the Dust")).toHaveCount(0);
  });

  test("a Part's own page leads to the Journey home", async ({ page }) => {
    await page.goto("/studies/qa-journey-part-one");
    await expect(page).toHaveURL(new RegExp(`${HOME}$`));
  });

  test("the map shows each stop's state, and only open stops are links", async ({ page }) => {
    await page.goto(HOME);
    // Audit 2026-11-13: no way back to My Library from the Journey home.
    await expect(page.getByRole("link", { name: "← My Library" })).toHaveAttribute("href", "/library");
    await expect(page.getByRole("heading", { level: 1, name: "QA Journey" })).toBeVisible();
    await expect(page.getByRole("img", { name: "3 of 5 weeks walked" })).toBeVisible();

    const partOne = page.locator("section", { has: page.getByRole("heading", { name: "Out of the Dust" }) });
    await expect(partOne.getByText("Done", { exact: true })).toHaveCount(3);
    await expect(partOne.getByText("3 of 3 done")).toBeVisible();

    const partTwo = page.locator("section", { has: page.getByRole("heading", { name: "Formed and Sent" }) });
    await expect(partTwo.getByRole("link", { name: /Part Two introduction/ })).toHaveAttribute("aria-current", "step");
    await expect(partTwo.getByText(/^Opens /)).toBeVisible();
    await expect(partTwo.getByRole("link", { name: /Week 3/ })).toHaveCount(0);

    const violations = await runAxe(page);
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  test("a stop whose week hasn't come can't be opened by URL", async ({ page, browser }) => {
    // Read Week 3's address from an admin's map, where every stop is a link.
    const admin = await browser.newContext({ storageState: "qa/.auth/admin.json" });
    const adminPage = await admin.newPage();
    await adminPage.goto(HOME);
    const href = await adminPage.getByRole("link", { name: /Week 3/ }).first().getAttribute("href");
    await admin.close();
    expect(href).toBeTruthy();

    await page.goto(href!);
    await expect(page).toHaveURL(new RegExp(`${HOME}$`));
  });

  test("the threshold looks back at Part One's answers, then crosses into Part Two", async ({ page }) => {
    await page.goto(HOME);
    await page.getByRole("link", { name: /Continue/ }).click();
    await expect(page.getByText("The Journey · Threshold")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Part Two — Formed and Sent" })).toBeVisible();
    // Audit 2026-11-13: every threshold's tab read "Introduction".
    await expect(page).toHaveTitle(/^Part Two introduction · /);

    // The introduction's sections read as tabs.
    await expect(page.getByRole("tab", { name: "Foreword" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("QA Journey foreword.")).toBeVisible();
    await expect(page.getByText("QA Journey preface.")).toBeHidden();
    await page.getByRole("button", { name: "Next: Preface →" }).click();
    await expect(page.getByRole("tab", { name: "Preface" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "The Weekly Rhythm" })).toBeVisible();
    await expect(page.getByText("QA Journey foreword.")).toBeHidden();

    const lookBack = page.locator("section", { has: page.getByRole("heading", { name: "Before you cross into Part Two" }) });
    await lookBack.getByText("Week 1: Where Most Men Actually Live").click();
    await expect(lookBack.getByText("QA look-back answer: in the places I keep hidden.")).toBeVisible();

    const violations = await runAxe(page);
    expect(violations, formatViolations(violations)).toEqual([]);

    await page.getByRole("button", { name: "Cross into Part Two" }).click();
    // Week 3's week hasn't come, so crossing leads home, which says when it opens.
    await expect(page).toHaveURL(new RegExp(`${HOME}$`));
    await expect(page.getByText("Up next")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Week 3: How Formation Actually Happens" })).toBeVisible();
    await expect(page.getByRole("img", { name: "4 of 5 weeks walked" })).toBeVisible();
  });
});

test.describe("The Journey, as qa-admin (not begun)", () => {
  test.use({ storageState: "qa/.auth/admin.json" });

  test("begins the Journey on a chosen day", async ({ page }) => {
    await page.goto(HOME);
    await expect(page.getByRole("heading", { name: "Before you begin" })).toBeVisible();
    const violations = await runAxe(page);
    expect(violations, formatViolations(violations)).toEqual([]);

    await page.getByText("Friday", { exact: true }).click();
    await page.getByRole("button", { name: "Begin the Journey" }).click();

    await expect(page.getByRole("heading", { name: "Your rhythm" })).toBeVisible();
    await expect(page.getByText("Your weeks open on Fridays.")).toBeVisible();
    await expect(page.getByText("This week", { exact: true }).first()).toBeVisible();
  });
});
