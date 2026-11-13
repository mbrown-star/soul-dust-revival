import { test, expect, type Page } from "@playwright/test";
import { runAxe, formatViolations } from "../fixtures/axe";

// Fixture: qa-book (qa/scripts/seed-qa.ts), shaped like Revive Me: an
// Introduction (Foreword and Preface), two chapters in Part One and an
// Epilogue, each chapter with To Sit With questions and a Lift Up Your Eyes
// blessing. Owned by nobody; qa-admin reads it (admins can open any
// published study) and starts with no progress or answers.
test.describe("The book reader", () => {
  test.use({ storageState: "qa/.auth/admin.json" });

  async function openLesson(page: Page, title: string) {
    await page.goto("/studies/qa-book");
    await page.getByRole("link", { name: new RegExp(title) }).first().click();
    await expect(page).toHaveURL(/\/studies\/qa-book\/[^/]+$/);
  }

  test("a chapter shows its Part, opener, text, questions and blessing", async ({ page }) => {
    await openLesson(page, "Chapter 1: QA Chapter 1");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("QA Book: A Journey Out of the Dust");
    await expect(page.getByText("Part One · The Dust · Chapter 1", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "QA Chapter 1", level: 2 })).toBeVisible();
    await expect(page.getByText("from dust to chapter 1")).toBeVisible();
    await expect(page.getByText("“A QA verse for chapter 1.”")).toBeVisible();
    await expect(page.getByText("Genesis 2:1", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "A QA sub-heading 1", level: 3 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "To Sit With" })).toBeVisible();
    await expect(page.getByText("QA question one for chapter 1?")).toBeVisible();
    await expect(page.getByText("QA question two for chapter 1?")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lift Up Your Eyes" })).toBeVisible();
    await expect(page.getByText("A QA blessing for chapter 1.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Chapter 2 →" })).toBeVisible();
    await expect(page.getByRole("link", { name: "← Introduction" })).toBeVisible();
  });

  test("an answer saves, comes back after a reload, and collects in the Journal", async ({ page }) => {
    await openLesson(page, "Chapter 2: QA Chapter 2");
    await expect(page.getByRole("tab", { name: "Journal" })).toBeVisible();
    const answer = page.getByRole("textbox").first();
    await answer.fill("My QA answer to chapter two.");
    await answer.blur();
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole("textbox").first()).toHaveValue("My QA answer to chapter two.");

    await page.getByRole("tab", { name: "Journal" }).click();
    const journal = page.getByRole("tabpanel").filter({ hasText: "Your Answers" });
    await expect(journal.getByText("Chapter 2 · QA Chapter 2")).toBeVisible();
    await expect(journal.getByText("QA question one for chapter 2?")).toBeVisible();
    await expect(journal.getByText("My QA answer to chapter two.")).toBeVisible();
  });

  test("Contents groups chapters under their Part and marks the current one; finishing a chapter counts it", async ({ page }) => {
    await openLesson(page, "Epilogue: QA Ending");
    await expect(page.getByRole("img", { name: "0 of 3 chapters read" })).toBeVisible();
    await page.getByRole("button", { name: "Finished this chapter" }).click();
    await expect(page.getByRole("button", { name: "✓ Read" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("img", { name: "1 of 3 chapters read" })).toBeVisible();

    await page.getByRole("tab", { name: "Contents" }).click();
    const contents = page.getByRole("tabpanel").filter({ has: page.getByRole("heading", { name: "Part One · The Dust" }) });
    await expect(contents.getByRole("link", { name: /Chapter 1\s*QA Chapter 1/ })).toBeVisible();
    await expect(contents.getByRole("link", { name: /Chapter 2\s*QA Chapter 2/ })).toBeVisible();
    const current = contents.locator('a[aria-current="page"]');
    await expect(current).toContainText("Epilogue");
    await expect(current).toContainText("✓ Read");
  });

  test("the Introduction reads as Foreword and Preface tabs, with no questions", async ({ page }) => {
    await openLesson(page, "Introduction");
    await expect(page.getByRole("tab", { name: "Foreword" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Preface" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "To Sit With" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Finished reading" })).toBeVisible();
  });

  test("passes axe on a chapter and on each tab", async ({ page }) => {
    await openLesson(page, "Chapter 1: QA Chapter 1");
    let violations = await runAxe(page);
    expect(violations, formatViolations(violations)).toEqual([]);
    for (const tab of ["Contents", "Journal"]) {
      await page.getByRole("tab", { name: tab }).click();
      violations = await runAxe(page);
      expect(violations, formatViolations(violations)).toEqual([]);
    }
  });
});

// Fixture: qa-draft-book, an unpublished study whose two lessons are drafts.
test.describe("Reviewing a draft study", () => {
  test.describe("as qa-admin", () => {
    test.use({ storageState: "qa/.auth/admin.json" });
    test("lists the draft lessons and steps between them", async ({ page }) => {
      await page.goto("/studies/qa-draft-book");
      await page.getByRole("link", { name: /Chapter 1: QA Draft Chapter 1/ }).first().click();
      await expect(page.getByText("Admin preview: this study is a draft")).toBeVisible();
      await expect(page.getByRole("heading", { name: "QA Draft Chapter 1", level: 2 })).toBeVisible();
      await page.getByRole("link", { name: "Chapter 2 →" }).click();
      await expect(page.getByRole("heading", { name: "QA Draft Chapter 2", level: 2 })).toBeVisible();
      await page.getByRole("tab", { name: "Contents" }).click();
      await expect(page.getByRole("link", { name: /Chapter 1\s*QA Draft Chapter 1/ })).toBeVisible();
    });
  });

  test.describe("as qa-user", () => {
    test.use({ storageState: "qa/.auth/user.json" });
    test("can't open it", async ({ page }) => {
      await page.goto("/studies/qa-draft-book");
      await expect(page).not.toHaveURL(/qa-draft-book/);
    });
  });
});
