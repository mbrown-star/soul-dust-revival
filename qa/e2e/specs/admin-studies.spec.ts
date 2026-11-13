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

  // Audit 2026-11-13: no published/draft state or lesson count on the list.
  test("each study row shows Published or Draft and its lesson count", async ({ page }) => {
    await page.goto("/admin/studies");
    const row = page.getByRole("link", { name: /QA Colossians-Shaped Study/i });
    await expect(row.getByTestId("study-status-badge")).toHaveText("Published");
    await expect(row).toContainText(/\d+ lessons?/);
    const draftRow = page.getByRole("link", { name: /QA Draft Book/i });
    await expect(draftRow.getByTestId("study-status-badge")).toHaveText("Draft");
    await expect(page).toHaveTitle(/^Studies — Admin$/);
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
    // Interactions before hydration (focusing a drag handle, clicking a
    // button) are silently lost; wait for the page to settle first.
    await page.waitForLoadState("networkidle");
  }

  // Tests that edit a published fixture lesson end by discarding the draft,
  // so later tests start from the published version (no "Unpublished
  // changes" panel shifting the layout).
  async function discardDraft(page: import("@playwright/test").Page) {
    await page.reload();
    await page.waitForLoadState("networkidle");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Discard changes" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Live", { exact: true })).toBeVisible();
  }

  // A drag needs both ends on screen; on a short viewport the lesson header
  // (with a published lesson's Live panel) pushes the blocks below the fold.
  async function tallViewport(page: import("@playwright/test").Page) {
    const viewport = page.viewportSize();
    if (viewport && viewport.height < 1400) await page.setViewportSize({ width: viewport.width, height: 1400 });
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
    await discardDraft(page);
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
    await discardDraft(page);
  });

  test("an image added inside a week section saves and shows in the reader right after that section", async ({ page }) => {
    await openLesson(page, /QA Colossians-Shaped Study/i, /Week 1: Grace and Truth/i);
    const lessonId = page.url().split("/lessons/")[1]!;

    await page.getByRole("button", { name: /Section Where We Are/ }).click();
    await page.getByRole("button", { name: "+ Image" }).first().click();
    await page.getByText("Use a link").click();
    const link = page.getByLabel("image link");
    await link.fill("https://example.com/qa-week-media.png");
    await link.press("Enter");
    await page.getByLabel(/Alt text/).fill("QA week media image");
    await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();

    // The week is published, so the image is a draft: the admin's preview of
    // the unpublished changes shows it in the Study tab after the section.
    await page.goto(`/studies/qa-study-not-started/${lessonId}?draft=1`);
    const section = page.getByRole("heading", { name: "Where We Are" }).locator("..");
    await expect(section.getByRole("img", { name: "QA week media image" })).toBeAttached();

    // Clean up: discard the draft, back to the published week.
    await page.goBack();
    await page.waitForLoadState("networkidle");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Discard changes" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Live", { exact: true })).toBeVisible();
  });

  test("the plain fallback lesson (no studyContent) offers to start a week, and keeps its block canvas", async ({ page }) => {
    await openLesson(page, /QA Colossians-Shaped Study/i, /^Introduction$/i);
    // On an Introduction the offer is folded away (audit 2026-11-13).
    await expect(page.getByRole("button", { name: "Start building this week" })).toBeHidden();
    await page.getByText("Build this as a week instead").click();
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
    await page.getByText("Build this as a week instead").click();
    await page.getByRole("button", { name: "Start building this week" }).click();

    await expect(page.getByLabel("Subtitle")).toHaveValue("");
    await page.getByLabel("Subtitle").fill("A draft subtitle, not yet saved");
    // Key verse and its reference. (The passage is optional: a week may print none.)
    await expect(page.getByRole("status").filter({ hasText: /Not saved yet — 2 fields need filling in/ })).toBeVisible();
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
    await discardDraft(page);
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
    await tallViewport(page);
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
    await discardDraft(page);
  });

  test("blocks reorder by keyboard drag (Space, arrow, Space) and the order persists", async ({ page }) => {
    await tallViewport(page);
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
    const restored = page.waitForResponse((r) => r.url().endsWith("/api/admin/content-blocks") && r.request().method() === "PATCH");
    await page.getByRole("button", { name: "Move Question block down" }).click();
    await expect(cardToggles.first()).toContainText("Text");
    expect((await restored).ok()).toBe(true);
    await discardDraft(page);
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

  test("a lesson can be marked as the free sample in the builder, and the study page shows it", async ({ page }) => {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: /QA Colossians-Shaped Study/i }).click();
    await expect(page).toHaveURL(/\/admin\/studies\/[0-9a-f-]+$/);
    const studyUrl = page.url();

    await page.getByLabel("New lesson title").fill("QA Sample Toggle");
    await page.getByRole("button", { name: "+ Add lesson" }).click();
    await expect(page).toHaveURL(/\/lessons\/[0-9a-f-]+$/);
    await page.waitForLoadState("networkidle");

    const sample = page.getByRole("checkbox", { name: "Free sample" });
    await expect(sample).not.toBeChecked();
    const saved = page.waitForResponse((r) => r.url().endsWith("/api/admin/lessons") && r.request().method() === "PATCH");
    await sample.check();
    expect((await saved).status()).toBe(200);
    await expect(page.getByText(/any signed-in reader can open this lesson/)).toBeVisible();

    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Free sample" })).toBeChecked();

    await page.goto(studyUrl);
    const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "QA Sample Toggle" }) });
    await expect(row.getByText("Free sample")).toBeVisible();

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Delete draft lesson QA Sample Toggle" }).click();
    await expect(page.getByRole("link", { name: "QA Sample Toggle" })).toHaveCount(0);
  });

  test("edits to a published lesson stay a draft until published, and Discard brings back the live version", async ({ page }) => {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: /QA Colossians-Shaped Study/i }).click();
    await expect(page).toHaveURL(/\/admin\/studies\/[0-9a-f-]+$/);
    const studyUrl = page.url();
    await page.getByLabel("New lesson title").fill("QA Draft And Publish");
    await page.getByRole("button", { name: "+ Add lesson" }).click();
    await expect(page).toHaveURL(/\/lessons\/[0-9a-f-]+$/);
    await page.waitForLoadState("networkidle");
    const builderUrl = page.url();
    const lessonId = builderUrl.split("/").pop()!;
    const readerUrl = `/studies/qa-study-not-started/${lessonId}`;
    const lessonPatch = () => page.waitForResponse((r) => r.url().endsWith("/api/admin/lessons") && r.request().method() === "PATCH");
    const prompt = () => page.getByLabel("Question prompt");
    async function setPrompt(text: string) {
      await prompt().fill(text);
      await expect(page.getByRole("status").filter({ hasText: "Saved" }).last()).toBeVisible();
    }

    // A draft lesson: write it, then publish it.
    await page.getByRole("button", { name: "Add Question block" }).click();
    await setPrompt("Published prompt");
    const published = lessonPatch();
    await page.getByRole("checkbox", { name: "Published" }).check();
    expect((await published).status()).toBe(200);
    await expect(page.getByText("Live", { exact: true })).toBeVisible();

    // An edit now is a draft: readers still see the published wording.
    await setPrompt("Draft prompt");
    await expect(page.getByText("Unpublished changes")).toBeVisible();
    await page.goto(readerUrl);
    await expect(page.getByText("Published prompt")).toBeVisible();
    await expect(page.getByText("Draft prompt")).toHaveCount(0);

    // The admin's preview shows the draft, labeled as such.
    await page.goto(`${readerUrl}?draft=1`);
    await expect(page.getByText("Draft prompt")).toBeVisible();
    await expect(page.getByText(/Admin preview: unpublished changes/)).toBeVisible();

    // Publish changes: readers now get the new wording.
    await page.goto(builderUrl);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Publish changes" }).click();
    await expect(page.getByText("Published. Readers now see these changes.")).toBeVisible();
    await page.goto(readerUrl);
    await expect(page.getByText("Draft prompt")).toBeVisible();

    // Another edit, discarded: back to the published wording.
    await page.goto(builderUrl);
    await page.waitForLoadState("networkidle");
    await setPrompt("Discard me");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Discard changes" }).click();
    await page.waitForLoadState("networkidle");
    await expect(prompt()).toHaveValue("Draft prompt");
    await expect(page.getByText("Live", { exact: true })).toBeVisible();

    // Clean up: unpublish, then delete the throwaway lesson.
    const unpublished = lessonPatch();
    await page.getByRole("checkbox", { name: "Published" }).uncheck();
    expect((await unpublished).status()).toBe(200);
    await page.goto(studyUrl);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Delete draft lesson QA Draft And Publish" }).click();
    await expect(page.getByRole("link", { name: "QA Draft And Publish" })).toHaveCount(0);
  });

  test("a published week's edits stay a draft for readers until published, and can be discarded", async ({ page }) => {
    await openLesson(page, /QA Colossians-Shaped Study/i, /Week 1: Grace and Truth/i);
    const builderUrl = page.url();
    const readerUrl = `/studies/qa-study-not-started/${builderUrl.split("/").pop()}`;

    await page.getByLabel("Subtitle").fill("A drafted subtitle");
    await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
    await expect(page.getByText("Unpublished changes")).toBeVisible();

    await page.goto(readerUrl);
    await expect(page.getByText("A QA fixture week")).toBeVisible();
    await expect(page.getByText("A drafted subtitle")).toHaveCount(0);
    await page.goto(`${readerUrl}?draft=1`);
    await expect(page.getByText("A drafted subtitle")).toBeVisible();

    await page.goto(builderUrl);
    await page.waitForLoadState("networkidle");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Discard changes" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByLabel("Subtitle")).toHaveValue("A QA fixture week");
    await expect(page.getByText("Live", { exact: true })).toBeVisible();
  });

  // Regression: the Study reader crashed (500) on a week saved before it had
  // any stations -- the Work the Word tab assumed at least one.
  test("a brand-new week with only its required fields opens in the reader", async ({ page }) => {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: /QA Colossians-Shaped Study/i }).click();
    await expect(page).toHaveURL(/\/admin\/studies\/[0-9a-f-]+$/);
    const studyUrl = page.url();
    await page.getByLabel("New lesson title").fill("QA Empty Week");
    await page.getByRole("button", { name: "+ Add lesson" }).click();
    await expect(page).toHaveURL(/\/lessons\/[0-9a-f-]+$/);
    const lessonId = page.url().split("/lessons/")[1]!;

    await page.getByRole("button", { name: "Start building this week" }).click();
    await page.getByLabel(/^Key verse/).first().fill("A verse.");
    await page.getByLabel(/^Key verse reference/).fill("Col 1:1");
    await page.getByRole("tab", { name: /^Passage/ }).click();
    await page.getByLabel(/^Passage reference/).fill("Col 1:1-2");
    await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
    // Once the week exists, the free-form block canvas goes away without a reload.
    await expect(page.getByRole("navigation", { name: "Add a block" })).toHaveCount(0);

    const res = await page.goto(`/studies/qa-study-not-started/${lessonId}`);
    expect(res?.status()).toBe(200);
    await page.getByRole("tab", { name: /Work the Word/ }).click();
    await expect(page.getByRole("button", { name: "Go to Live It →" })).toBeVisible();

    await page.goto(studyUrl);
    await page.waitForLoadState("networkidle");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Delete draft lesson QA Empty Week" }).click();
    await expect(page.getByRole("link", { name: "QA Empty Week" })).toHaveCount(0);
  });

  test("lessons reorder on the study page, and the order persists", async ({ page }) => {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: /QA Colossians-Shaped Study/i }).click();
    await expect(page).toHaveURL(/\/admin\/studies\/[0-9a-f-]+$/);
    // Wait for hydration: a click on the server-rendered button before React
    // attaches its handler does nothing (seen on the slower mobile project).
    await page.waitForLoadState("networkidle");
    const items = page.getByRole("listitem");
    await expect(items.first()).toContainText("Week 1: Grace and Truth");

    const saveDown = page.waitForResponse((r) => r.url().endsWith("/api/admin/lessons") && r.request().method() === "PATCH");
    await page.getByRole("button", { name: "Move Week 1: Grace and Truth down" }).click();
    await expect(items.first()).toContainText("Introduction");
    expect((await saveDown).ok()).toBe(true);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("listitem").first()).toContainText("Introduction");

    // Wait for the restore to save, or the next run starts from the wrong order.
    const saveUp = page.waitForResponse((r) => r.url().endsWith("/api/admin/lessons") && r.request().method() === "PATCH");
    await page.getByRole("button", { name: "Move Week 1: Grace and Truth up" }).click();
    await expect(page.getByRole("listitem").first()).toContainText("Week 1: Grace and Truth");
    expect((await saveUp).ok()).toBe(true);
  });
});
