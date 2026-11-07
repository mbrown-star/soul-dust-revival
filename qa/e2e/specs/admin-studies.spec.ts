import { test, expect } from "@playwright/test";

test.describe("admin studies list and editor, as qa-admin", () => {
  test.use({ storageState: "qa/.auth/admin.json" });

  test("list shows all QA fixture studies by title", async ({ page }) => {
    await page.goto("/admin/studies");
    await expect(page.getByRole("link", { name: /QA Colossians-Shaped Study/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /QA Devotional Fixture/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /QA Completed Study/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /QA Bundle Study/i })).toBeVisible();
  });

  // Real finding, confirmed by reading app/admin/studies/page.tsx: the list
  // row renders only title + slug + draft status -- there is NO kind
  // (devotional vs study) indicator anywhere on this list. An admin cannot
  // tell a devotional from an interactive study without opening each one.
  // This spec documents the CURRENT behavior (asserts the badge is absent)
  // rather than asserting a badge that doesn't exist -- see
  // qa/checklists/07-admin-console.md for this flagged as a UX gap.
  test("list row shows no kind (devotional/study) indicator -- documents a real gap, not a bug", async ({ page }) => {
    await page.goto("/admin/studies");
    // Use the "Completed" fixture's row -- its title/slug ("qa-study-completed")
    // don't themselves contain the word "devotional" or "study" as a
    // standalone word, unlike "QA Devotional Fixture" (slug
    // qa-devotional-fixture, which would make a plain text-contains check
    // against that row a false positive regardless of whether a real badge
    // exists).
    const row = page.getByRole("link", { name: /QA Completed Study/i });
    await expect(row).not.toContainText(/devotional/i);
    // No dedicated kind-badge element exists anywhere in the list markup.
    await expect(page.locator('[data-testid="study-kind-badge"]')).toHaveCount(0);
  });

  test("editing a study shows its real Kind as a radio selection", async ({ page }) => {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: /QA Devotional Fixture/i }).click();
    await expect(page).toHaveURL(/\/admin\/studies\/[0-9a-f-]+$/);
    await expect(page.getByText("Kind")).toBeVisible();
    await expect(page.getByRole("radio", { name: /^Devotional/i })).toBeChecked();
    await expect(page.getByRole("radio", { name: /^Study/i })).not.toBeChecked();
  });

  test("the interactive-study fixture's Kind is correctly 'study'", async ({ page }) => {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: /QA Colossians-Shaped Study/i }).click();
    await expect(page.getByRole("radio", { name: /^Study/i })).toBeChecked();
  });

  // Real finding, confirmed by reading app/admin/studies/[id]/lessons/
  // [lessonId]/page.tsx: the lesson editor only ever renders
  // LessonBlockEditor against content_blocks -- there is no UI path at all
  // to view or edit a lesson's structured `studyContent` JSON (the 5-tab
  // Study reader's actual data source). It can only be written by backfill
  // scripts. This is consistent with CLAUDE.md's own description of
  // studyContent as "populated at import/backfill time", but is worth
  // surfacing explicitly as a real admin capability gap.
  test("lesson editor for a studyContent-backed lesson shows only its content_blocks, no structured-week editor", async ({ page }) => {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: /QA Colossians-Shaped Study/i }).click();
    await page.getByRole("link", { name: /Week 1: Grace and Truth/i }).click();
    await expect(page).toHaveURL(/\/lessons\/[0-9a-f-]+$/);
    // The 3 Work the Word question content_blocks are visible (these exist
    // independently of studyContent)...
    await expect(page.getByText(/Where have you recently needed grace/i)).toBeVisible();
    // ...but nothing on this page exposes the week's subtitle/passage/
    // prayer/benediction fields that the real Study reader renders from
    // studyContent -- there is no field or label for any of them here.
    await expect(page.locator("body")).not.toContainText(/subtitle/i);
    await expect(page.locator("body")).not.toContainText(/benediction/i);
    await expect(page.locator("body")).not.toContainText(/passage ref/i);
  });

  test("the plain fallback lesson (no studyContent) is editable as ordinary content blocks", async ({ page }) => {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: /QA Colossians-Shaped Study/i }).click();
    await page.getByRole("link", { name: /^Introduction$/i }).click();
    await expect(page.locator("body")).toContainText(/no structured studyContent/i);
  });
});
