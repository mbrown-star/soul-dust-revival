import { test, expect, type Page } from "@playwright/test";
import { simulateSlowNetwork, clearSlowNetwork } from "../../fixtures/networkThrottle";

// Lives in race-conditions/ (see qa/CONVENTIONS.md "Testing for race
// conditions") rather than alongside devotional-reader.spec.ts's other
// tests: this one exists specifically to prove a timing-sensitive fix,
// using a real network delay and (via playwright.config.ts's mobile-webkit
// project) a real non-Chromium engine, not to cover the devotional reader's
// ordinary functional behavior.
test.describe("Question-block save survives navigating away immediately", () => {
  test.use({ storageState: "qa/.auth/user.json" });

  async function openDay(page: Page, dayTitleSubstring: string) {
    await page.goto("/studies/qa-devotional-fixture");
    await page.getByRole("link", { name: new RegExp(dayTitleSubstring) }).click();
    await expect(page).toHaveURL(/\/studies\/qa-devotional-fixture\/[^/]+$/);
  }

  // Regression test for a live bug report (not in the original audit): an
  // answer typed into a question block was lost if the reader navigated away
  // (e.g. tapping "Next day") immediately after typing, worse on mobile.
  // Root cause: QuestionBlock.tsx's onBlur save was a plain fetch() with no
  // `keepalive`, so a real page navigation starting right after blur could
  // abort the save request before it reached the server. On a fast local
  // dev server the save usually completes before navigation has a real
  // chance to cancel it either way -- confirmed directly: this exact test,
  // run with no artificial delay, passed whether or not the fix was even in
  // the code. simulateSlowNetwork puts a realistic amount of latency back in
  // deliberately, long enough that navigating immediately (this test never
  // waits for the "Saved" indicator) gives the browser a real window to
  // abort the request -- which is exactly what reproduces the bug without
  // `keepalive` and exactly what `keepalive` is for.
  test("an answer typed just before navigating away is still saved (keepalive)", async ({ page }) => {
    await simulateSlowNetwork(page, "**/api/responses", 1500);

    await openDay(page, "DAY 2");
    const newAnswer = "Typed right before navigating away -- must still save.";
    await page.getByLabel(/trust God's bigger plan/i).fill(newAnswer);
    await page.getByRole("link", { name: "Next day" }).click();
    await expect(page).toHaveURL(/\/studies\/qa-devotional-fixture\/[^/]+$/);

    await clearSlowNetwork(page, "**/api/responses");
    await openDay(page, "DAY 2");
    await expect(page.getByLabel(/trust God's bigger plan/i)).toHaveValue(newAnswer);
  });
});
