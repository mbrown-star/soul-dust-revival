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
    await expect(page.getByText("Kind", { exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: /^Devotional/i })).toBeChecked();
    await expect(page.getByRole("radio", { name: /^Study/i })).not.toBeChecked();
  });

  test("the interactive-study fixture's Kind is correctly 'study'", async ({ page }) => {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: /QA Colossians-Shaped Study/i }).click();
    await expect(page.getByRole("radio", { name: /^Study/i })).toBeChecked();
  });

  async function openLesson(page: import("@playwright/test").Page, study: RegExp, lesson: RegExp) {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: study }).click();
    await page.getByRole("link", { name: lesson }).click();
    await expect(page).toHaveURL(/\/lessons\/[0-9a-f-]+$/);
  }

  // A Study lesson with structured content opens in the week builder: one
  // tab per reader tab, and no free-form block palette (its question blocks
  // are the stations' answer plumbing, owned by the week).
  test("a studyContent-backed lesson opens in the week builder, laid out by reader tab", async ({ page }) => {
    await openLesson(page, /QA Colossians-Shaped Study/i, /Week 1: Grace and Truth/i);
    await expect(page.getByRole("tab", { name: /^Study/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("Subtitle")).toHaveValue("A QA fixture week");

    await page.getByRole("tab", { name: /^Passage/ }).click();
    await expect(page.getByLabel("Passage reference")).toHaveValue("Colossians 1:1–14");

    await page.getByRole("tab", { name: /^Work the Word/ }).click();
    await expect(page.getByRole("button", { name: /1\. 1:2 · χάρις/ })).toBeVisible();

    await expect(page.getByRole("navigation", { name: "Add a block" })).toHaveCount(0);
  });

  test("week edits autosave and persist across a reload", async ({ page }) => {
    await openLesson(page, /QA Colossians-Shaped Study/i, /Week 1: Grace and Truth/i);

    await page.getByLabel("Subtitle").fill("Edited via the week builder");
    await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Subtitle")).toHaveValue("Edited via the week builder");

    await page.getByLabel("Subtitle").fill("A QA fixture week");
    await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
  });

  test("stations reorder with Move buttons, and the new order persists", async ({ page }) => {
    await openLesson(page, /QA Colossians-Shaped Study/i, /Week 1: Grace and Truth/i);
    await page.getByRole("tab", { name: /^Work the Word/ }).click();

    await page.getByRole("button", { name: /Move station 1 \(1:2\) down/ }).click();
    await expect(page.getByRole("button", { name: /1\. 1:4/ })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();

    await page.reload();
    await page.getByRole("tab", { name: /^Work the Word/ }).click();
    await expect(page.getByRole("button", { name: /1\. 1:4/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /2\. 1:2 · χάρις/ })).toBeVisible();

    // Restore the fixture order.
    await page.getByRole("button", { name: /Move station 2 \(1:2\) up/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
  });

  test("the plain fallback lesson (no studyContent) offers to start a week, and keeps its block canvas", async ({ page }) => {
    await openLesson(page, /QA Colossians-Shaped Study/i, /^Introduction$/i);
    await expect(page.getByRole("button", { name: "Start building this week" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Add a block" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Text block" })).toContainText(/QA fixture lesson with no structured studyContent/i);
  });

  test("a devotional-kind lesson never offers a structured week", async ({ page }) => {
    await openLesson(page, /QA Devotional Fixture/i, /DAY 1/i);
    await expect(page.getByRole("button", { name: "Start building this week" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Add a block" })).toBeVisible();
  });

  // Starting a week saves nothing until its required fields are filled --
  // this fixture lesson is also relied on by study-reader.spec.ts's
  // "falls back to the plain reading view" test, so it must stay unsaved.
  test("starting a week shows an empty builder that reports what's still required", async ({ page }) => {
    await openLesson(page, /QA Colossians-Shaped Study/i, /^Introduction$/i);
    await page.getByRole("button", { name: "Start building this week" }).click();

    await expect(page.getByLabel("Subtitle")).toHaveValue("");
    await page.getByLabel("Subtitle").fill("A draft subtitle, not yet saved");
    await expect(page.getByRole("status").filter({ hasText: /Not saved yet -- 3 fields need filling in/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Add section" })).toBeVisible();
    await page.getByRole("tab", { name: /^Work the Word/ }).click();
    await expect(page.getByRole("button", { name: "+ Add station" })).toBeVisible();
  });

  test("a block added from the palette can use a linked image, survives a reload, and can be removed", async ({ page }) => {
    await openLesson(page, /QA Devotional Fixture/i, /DAY 1/i);

    await page.getByRole("button", { name: "Add Image block" }).click();
    await page.getByText("Use a link").click();
    const link = page.getByLabel("image link");
    await link.fill("https://example.com/qa-builder.png");
    await link.press("Enter");
    await page.getByLabel(/Alt text/).fill("A QA builder test image");
    await expect(page.getByRole("status").filter({ hasText: "Saved" }).last()).toBeVisible();

    await page.reload();
    const card = page.getByRole("button", { name: /Image A QA builder test image/ });
    await expect(card).toBeVisible();

    await page.getByRole("button", { name: "Remove this image" }).click();
    await expect(page.getByText("Removed the image block.")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: /Image A QA builder test image/ })).toHaveCount(0);
  });

  test("a linked image must be https", async ({ page }) => {
    await openLesson(page, /QA Devotional Fixture/i, /DAY 1/i);
    await page.getByRole("button", { name: "Add Image block" }).click();
    await page.getByText("Use a link").click();
    const link = page.getByLabel("image link");
    await link.fill("http://example.com/insecure.png");
    await link.press("Enter");
    await expect(page.getByText("Enter a full https:// link.")).toBeVisible();

    await page.getByRole("button", { name: "Remove this image" }).click();
    await expect(page.getByText("Removed the image block.")).toBeVisible();
  });

  test("dragging a block type from the palette inserts it where it's dropped", async ({ page }) => {
    await openLesson(page, /QA Devotional Fixture/i, /DAY 1/i);
    await page.getByRole("button", { name: "Collapse all" }).click();
    const cardToggles = page.locator('[aria-controls][aria-expanded]').filter({ hasText: /^(Text|Question|Callout)/ });
    await expect(cardToggles.first()).toContainText("Text");

    const source = (await page.getByRole("button", { name: /Add Callout block/ }).boundingBox())!;
    const target = (await cardToggles.first().boundingBox())!;
    await page.mouse.move(source.x + 30, source.y + 15);
    await page.mouse.down();
    await page.mouse.move(source.x + 50, source.y + 30, { steps: 5 });
    await page.mouse.move(target.x + 80, target.y + 10, { steps: 20 });
    await page.mouse.up();

    await expect(cardToggles.first()).toContainText("Callout");
    await page.reload();
    await page.getByRole("button", { name: "Collapse all" }).click();
    await expect(cardToggles.first()).toContainText("Callout");

    await page.getByRole("button", { name: "Remove this callout" }).click();
    await expect(page.getByText("Removed the callout block.")).toBeVisible();
  });

  test("blocks reorder by keyboard drag (Space, arrow, Space) and the order persists", async ({ page }) => {
    await openLesson(page, /QA Devotional Fixture/i, /DAY 1/i);
    await page.getByRole("button", { name: "Collapse all" }).click();
    const cardToggles = page.locator('[aria-controls][aria-expanded]').filter({ hasText: /^(Text|Question)/ });
    await expect(cardToggles.first()).toContainText("Text");

    await page.getByRole("button", { name: /Drag to reorder Text block, position 1/ }).focus();
    await page.keyboard.press("Space");
    // dnd-kit's live region says what's being dragged, in words (not ids).
    await expect(page.getByText(/Text block 1 is over Text block 1\./)).toBeAttached();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByText(/Text block 1 is over Question block 2\./)).toBeAttached();
    await page.keyboard.press("Space");
    await expect(cardToggles.first()).toContainText("Question");
    await page.waitForResponse((r) => r.url().includes("/api/admin/content-blocks") && r.request().method() === "PATCH");

    await page.reload();
    await page.getByRole("button", { name: "Collapse all" }).click();
    await expect(cardToggles.first()).toContainText("Question");

    // Restore the fixture order.
    await page.getByRole("button", { name: "Move Question block down" }).click();
    await expect(cardToggles.first()).toContainText("Text");
  });

  test("a draft lesson can be added and then deleted; published lessons have no Delete", async ({ page }) => {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: /QA Colossians-Shaped Study/i }).click();
    await expect(page).toHaveURL(/\/admin\/studies\/[0-9a-f-]+$/);
    const studyUrl = page.url();
    await expect(page.getByRole("button", { name: /Delete draft lesson Week 1: Grace and Truth/ })).toHaveCount(0);

    await page.getByLabel("New lesson title").fill("QA Draft To Delete");
    await page.getByRole("button", { name: "+ Add lesson" }).click();
    await expect(page).toHaveURL(/\/lessons\/[0-9a-f-]+$/);

    await page.goto(studyUrl);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Delete draft lesson QA Draft To Delete" }).click();
    await expect(page.getByRole("link", { name: "QA Draft To Delete" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("link", { name: "QA Draft To Delete" })).toHaveCount(0);
  });

  test("lessons reorder on the study page, and the order persists", async ({ page }) => {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: /QA Colossians-Shaped Study/i }).click();
    const items = page.getByRole("listitem");
    await expect(items.first()).toContainText("Week 1: Grace and Truth");

    await page.getByRole("button", { name: "Move Week 1: Grace and Truth down" }).click();
    await expect(items.first()).toContainText("Introduction");
    await page.reload();
    await expect(page.getByRole("listitem").first()).toContainText("Introduction");

    await page.getByRole("button", { name: "Move Week 1: Grace and Truth up" }).click();
    await expect(page.getByRole("listitem").first()).toContainText("Week 1: Grace and Truth");
  });
});
