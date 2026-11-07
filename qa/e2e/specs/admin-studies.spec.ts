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

  // FIXED (qa/findings/FINDINGS_2026-11-07.md #9): each row now shows a
  // Kind badge (app/admin/studies/page.tsx), so an admin can tell a
  // devotional from an interactive study without opening each one.
  test("list row shows a real Kind badge matching each fixture's actual kind", async ({ page }) => {
    await page.goto("/admin/studies");
    const studyRow = page.getByRole("link", { name: /QA Colossians-Shaped Study/i });
    const devotionalRow = page.getByRole("link", { name: /QA Devotional Fixture/i });
    await expect(studyRow.getByTestId("study-kind-badge")).toHaveText("Study");
    await expect(devotionalRow.getByTestId("study-kind-badge")).toHaveText("Devotional");
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

  // FIXED (qa/findings/FINDINGS_2026-11-07.md #8): a Study-kind lesson's
  // structured studyContent now has a real editor
  // (components/admin/StudyContentEditor.tsx), and the plain content_blocks
  // editor is hidden for such a lesson (its own content_blocks are just the
  // per-station question-save plumbing now, not meant for direct editing).
  test("lesson editor for a studyContent-backed lesson shows the structured editor, not the plain content-block one", async ({
    page,
  }) => {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: /QA Colossians-Shaped Study/i }).click();
    await page.getByRole("link", { name: /Week 1: Grace and Truth/i }).click();
    await expect(page).toHaveURL(/\/lessons\/[0-9a-f-]+$/);
    await expect(page.getByLabel("Subtitle")).toHaveValue("A QA fixture week");
    await expect(page.getByLabel("Passage reference (e.g. Colossians 1:1–14)")).toHaveValue("Colossians 1:1–14");
    await expect(page.getByText("Station 1 — 1:2 (χάρις)")).toBeVisible();
    // The plain content-block editor (and its "Add block" affordance) is
    // hidden entirely for this lesson now.
    await expect(page.getByRole("button", { name: /add block/i })).toHaveCount(0);
  });

  test("editing and saving the structured content persists across a reload", async ({ page }) => {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: /QA Colossians-Shaped Study/i }).click();
    await page.getByRole("link", { name: /Week 1: Grace and Truth/i }).click();

    const subtitleField = page.getByLabel("Subtitle");
    await subtitleField.fill("Edited via the real admin editor");
    await page.getByRole("button", { name: "Save study content" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Subtitle")).toHaveValue("Edited via the real admin editor");

    // Restore the fixture's original value so other specs/reruns aren't
    // affected by this one's edit.
    await page.getByLabel("Subtitle").fill("A QA fixture week");
    await page.getByRole("button", { name: "Save study content" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  });

  test("the plain fallback lesson (no studyContent) offers to create structured content, and still has the content-block editor", async ({
    page,
  }) => {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: /QA Colossians-Shaped Study/i }).click();
    await page.getByRole("link", { name: /^Introduction$/i }).click();
    await expect(page.locator("body")).toContainText(/no structured Study content yet/i);
    await expect(page.getByRole("button", { name: "Create structured Study content" })).toBeVisible();
    // The content-block editor for this lesson's existing plain text block
    // is still present underneath, unaffected.
    await expect(page.getByText(/QA fixture lesson with no structured studyContent/i)).toBeVisible();
  });

  test("a devotional-kind lesson never shows the structured-content gate", async ({ page }) => {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: /QA Devotional Fixture/i }).click();
    await page.getByRole("link", { name: /DAY 1/i }).click();
    await expect(page.getByRole("button", { name: "Create structured Study content" })).toHaveCount(0);
  });

  // Deliberately does NOT click "Save study content" -- this fixture lesson
  // (no studyContent) is also relied on by study-reader.spec.ts's own
  // "falls back to the plain reading view" test, which would break if this
  // one actually persisted new content to it.
  test("clicking 'Create structured Study content' reveals a fillable, empty editor", async ({ page }) => {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: /QA Colossians-Shaped Study/i }).click();
    await page.getByRole("link", { name: /^Introduction$/i }).click();
    await page.getByRole("button", { name: "Create structured Study content" }).click();

    const subtitleField = page.getByLabel("Subtitle");
    await expect(subtitleField).toHaveValue("");
    await subtitleField.fill("A draft subtitle, not yet saved");
    await expect(page.getByRole("button", { name: "Save study content" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add section" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add station" })).toBeVisible();
  });
});
