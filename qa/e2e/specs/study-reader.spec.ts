import { test, expect } from "@playwright/test";

// Fixture: qa-study-not-started (slug), lesson 1 "Week 1: Grace and Truth"
// has full studyContent with 3 Work the Word stations -- station 3 (ref
// "1:11") has anchor: null, i.e. no inline Greek match, exercising the
// fallback button fixed in components/study/study-tabs/PassageTab.tsx
// (2026-11-11). Lesson 2 "Introduction" has no studyContent at all.
test.describe("Interactive Study reader", () => {
  test.use({ storageState: "qa/.auth/user.json" });

  async function openLesson1(page: import("@playwright/test").Page) {
    await page.goto("/studies/qa-study-not-started");
    await page.getByRole("link", { name: /Week 1: Grace and Truth/ }).click();
    await expect(page).toHaveURL(/\/studies\/qa-study-not-started\/[^/]+$/);
  }

  test("5-tab shell renders with the correct breadcrumb and week heading", async ({ page }) => {
    await openLesson1(page);

    // Breadcrumb: "Soul Dust Revival · {study title} · {week label} ▾"
    await expect(page.getByRole("button", { name: /Soul Dust Revival · QA Colossians-Shaped Study · Week 1/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Grace and Truth", level: 1 })).toBeVisible();

    const tablist = page.getByRole("tablist", { name: "Week sections" });
    for (const label of ["Study", "Passage", "Work the Word", "Live It", "Lift Up"]) {
      await expect(tablist.getByRole("tab", { name: label })).toBeVisible();
    }
  });

  test("Study tab shows the key verse, sections, and Four Parts accordion", async ({ page }) => {
    await openLesson1(page);
    await expect(page.getByText("Grace to you and peace from God our Father.").first()).toBeVisible();
    await expect(page.getByText("Colossians 1:2").first()).toBeVisible();
    await expect(page.getByText("READ · REFLECT · RETURN")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Where We Are" })).toBeVisible();
    // FIXED (qa/findings/FINDINGS_2026-11-07.md #3): all parts now start
    // closed, so the first click on any part both opens it and marks it
    // read -- no more default-open-but-unread part, no more a click on an
    // already-open header unexpectedly collapsing it.
    await expect(page.getByText("Fixture paragraph for part 1.")).toHaveCount(0);
    await expect(page.getByText("0 of 2 parts read")).toBeVisible();

    await page.getByRole("button", { name: /Part 1/ }).click();
    await expect(page.getByText("Fixture paragraph for part 1.")).toBeVisible();
    await expect(page.getByText("1 of 2 parts read")).toBeVisible();

    await page.getByRole("button", { name: /Part 2/ }).click();
    await expect(page.getByText("Fixture paragraph for part 2.")).toBeVisible();
    await expect(page.getByText("2 of 2 parts read")).toBeVisible();
  });

  test("Passage tab shows inline Greek matches, a fallback button for the unmatched station, and Hide It in Your Heart", async ({ page }) => {
    await openLesson1(page);
    await page.getByRole("tab", { name: "Passage" }).click();

    // Two stations whose anchor word is found inline in the passage text --
    // rendered as real underlined buttons, not plain text.
    await expect(page.getByRole("button", { name: "Grace" })).toBeVisible();
    await expect(page.getByRole("button", { name: "faith" })).toBeVisible();

    // Station 3 (ref "1:11") has anchor: null -- must still be reachable via
    // a fallback button, not silently missing.
    const fallback = page.getByRole("button", { name: /ὑπομονή · 1:11/ });
    await expect(fallback).toBeVisible();

    // The memorization section this fix added.
    await expect(page.getByRole("heading", { name: "Hide It in Your Heart" })).toBeVisible();
    await expect(page.getByText("Colossians 1:2, this week's key verse", { exact: false })).toBeVisible();

    // Opening the Greek sheet via the inline match. Work the Word's own
    // "Open the Greek · χάρις" disclosure button stays mounted (hidden) in
    // the DOM per the 5-tab shell's keep-all-panels-mounted pattern, so
    // assertions are scoped to the sheet dialog to avoid matching it too.
    await page.getByRole("button", { name: "Grace" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("χάρις")).toBeVisible();
    await expect(sheet.getByText("grace, unearned favor")).toBeVisible();
    // On a narrow mobile viewport this button sits flush against the very
    // bottom of the sheet with no safe-area bottom padding
    // (components/study/Sheet.tsx has no env(safe-area-inset-bottom)), so in
    // `next dev` specifically its bottom-left corner is covered by Next.js's
    // own dev-mode indicator badge (production has no such badge, but a real
    // notched/gesture-nav phone has its own bottom safe-area instead) --
    // clicking the button's right portion avoids the badge actually eating
    // the click. Real finding either way: see qa/findings for the missing
    // safe-area padding.
    const goToQuestion = sheet.getByRole("button", { name: "Go to this question" });
    const box = await goToQuestion.boundingBox();
    if (box) await page.mouse.click(box.x + box.width - 10, box.y + box.height / 2);
    else await goToQuestion.click();
    // Should land on Work the Word, scrolled to station 1:2.
    await expect(page.getByRole("tab", { name: "Work the Word", selected: true })).toBeVisible();
  });

  test("the unmatched station's fallback button opens the correct Greek sheet", async ({ page }) => {
    await openLesson1(page);
    await page.getByRole("tab", { name: "Passage" }).click();
    await page.getByRole("button", { name: /ὑπομονή · 1:11/ }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("ὑπομονή")).toBeVisible();
    await expect(sheet.getByText("steadfast endurance")).toBeVisible();
  });

  test("Work the Word stepper shows all 3 stations and advances correctly", async ({ page }) => {
    await openLesson1(page);
    await page.getByRole("tab", { name: "Work the Word" }).click();
    // Scoped to the active tabpanel: the fixture's key verse ("Grace to you
    // and peace...") also appears verbatim in the Study/Passage/Lift Up tabs,
    // which stay mounted-but-hidden, not removed, per the 5-tab shell's
    // design -- an unscoped getByText would match all of them at once.
    const panel = page.locator('[role="tabpanel"]:not([hidden])');

    const stationTabs = page.getByRole("tablist", { name: "Stations" }).getByRole("tab");
    await expect(stationTabs).toHaveCount(3);
    await expect(panel.getByText("Grace to you and peace from God our Father.", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Next →" }).click();
    await expect(panel.getByText("Since we heard of your faith", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Next →" }).click();
    await expect(panel.getByText("Strengthened with all power", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Go to Live It →" })).toBeVisible();
  });

  test("Live It tab shows the Life Application eyebrow with the correct week label", async ({ page }) => {
    await openLesson1(page);
    await page.getByRole("tab", { name: "Live It" }).click();
    await expect(page.getByText("Life Application · Week 1")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Where This Meets Real Life" })).toBeVisible();
  });

  test("Lift Up tab shows the benediction and closing verse", async ({ page }) => {
    await openLesson1(page);
    await page.getByRole("tab", { name: "Lift Up" }).click();
    await expect(page.getByText("Go in grace.")).toBeVisible();
    await expect(page.getByText("Colossians 1:2").last()).toBeVisible();
    await expect(page.getByText("Quiet Question to Carry")).toBeVisible();
  });

  test("a study-kind lesson with no studyContent falls back to the plain reading view, not an error or empty tabs", async ({ page }) => {
    await page.goto("/studies/qa-study-not-started");
    await page.getByRole("link", { name: "Introduction" }).click();
    await expect(page).toHaveURL(/\/studies\/qa-study-not-started\/[^/]+$/);

    // No 5-tab shell at all for this lesson.
    await expect(page.getByRole("tablist", { name: "Week sections" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Introduction", level: 1 })).toBeVisible();
    await expect(
      page.getByText("A QA fixture lesson with no structured studyContent, to exercise the plain reading fallback.")
    ).toBeVisible();

    // Its Foreword and Preface read as tabs, like a Journey threshold's.
    await expect(page.getByRole("tab", { name: "Foreword" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("The QA study's preface.")).toBeHidden();
    await page.getByRole("button", { name: "Next: Preface →" }).click();
    await expect(page.getByRole("tab", { name: "Preface" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("The QA study's preface.")).toBeVisible();
  });
});
