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

  // Audit 2026-11-13: the back link, the week count and the phone header.
  test("names the study in its back link, counts only weeks, and stacks the header on a phone", async ({ page }, testInfo) => {
    await openLesson1(page);
    await expect(page.getByRole("link", { name: "← QA Colossians-Shaped Study" })).toBeVisible();

    // The fixture has Weeks 1–3 and an Introduction: three weeks, not four.
    await page.getByRole("button", { name: /Soul Dust Revival · QA Colossians-Shaped Study · Week 1/ }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "QA Colossians-Shaped Study · 3 Weeks" })).toBeVisible();
    await page.keyboard.press("Escape");

    const title = await page.getByRole("heading", { name: "Grace and Truth", level: 1 }).boundingBox();
    const ring = await page.getByLabel("Week progress").boundingBox();
    if (testInfo.project.name === "mobile-chromium") {
      // Title on its own row, above the ring and arrows.
      expect(title!.y + title!.height).toBeLessThanOrEqual(ring!.y);
    } else {
      // Side by side on a wide screen.
      expect(ring!.y).toBeLessThan(title!.y + title!.height);
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
    // rendered as real underlined buttons, not plain text. Each says what it
    // opens (audit 2026-11-13: they were named only by the word).
    await expect(page.getByRole("button", { name: "Word study: grace (χάρις)" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Word study: faith \(/ })).toBeVisible();

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
    await page.getByRole("button", { name: "Word study: grace (χάρις)" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("χάρις")).toBeVisible();
    // The fixture, like Colossians, has no `lang`: the script says Greek.
    await expect(sheet.getByText(/^The Greek · /)).toBeVisible();
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

  test("a Five Stations week: Hebrew word study, plain prayer, pull-quotes, no closing reference", async ({ page }) => {
    // Lesson 3 "Week 2: The Blessing Spoken" is shaped like the studies
    // parsed by soul-dust-interactive/tools/study/parse_five_stations.py.
    await page.goto("/studies/qa-study-not-started");
    await page.getByRole("link", { name: /Week 2: The Blessing Spoken/ }).click();
    await expect(page).toHaveURL(/\/studies\/qa-study-not-started\/[^/]+$/);

    // Study: an opening section with no heading shows its text without an empty heading.
    await expect(page.getByText("This week opens straight into the essay, with no heading.")).toBeVisible();
    await expect(page.getByText("One Part", { exact: true })).toBeVisible();

    // Work the Word: the word study is labelled Hebrew, headed by its
    // transliteration when no Hebrew script is printed.
    await page.getByRole("tab", { name: "Work the Word" }).click();
    await page.getByRole("button", { name: "Open the Hebrew · bārak" }).click();
    await expect(page.getByText("Going Deeper · The Hebrew")).toBeVisible();
    await expect(page.getByText("The blessing comes before the obedience, never after it.")).toBeVisible();
    await page.getByRole("tab", { name: "Station 2" }).click();
    await expect(page.getByRole("button", { name: "Open the Hebrew · שָׁמַר" })).toBeVisible();

    // Passage: gathered from two places, each under its own heading. Both
    // print a verse 6:24, and each word study is underlined in its own part.
    await page.getByRole("tab", { name: "Passage", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Numbers 6:24–26" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Deuteronomy 6:24" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Word study: bless \(/ })).toBeVisible();
    await page.getByRole("button", { name: /^Word study: preserve \(/ }).click();
    await expect(page.getByRole("dialog")).toContainText("shamar");
    // A modal sheet: focus moves into it, Escape closes it, focus goes back.
    await expect(page.getByRole("dialog").getByRole("button", { name: "Close" })).toBeFocused();
    // Tab and Shift+Tab stay inside the open sheet.
    for (const key of ["Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab"]) {
      await page.keyboard.press(key);
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Word study: preserve \(/ })).toBeFocused();

    // Live It: the printed prayer as lines, not the five-minute timer.
    await page.getByRole("tab", { name: "Live It" }).click();
    await expect(page.getByRole("heading", { name: "Daily Prayer" })).toBeVisible();
    await expect(page.getByText("Speak it over me again today.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start the prayer" })).toHaveCount(0);
    await expect(page.getByText("You cannot bless the families of the earth without the current running through you first.")).toBeVisible();

    // Lift Up: a pull-quote closing with no reference line under it.
    await page.getByRole("tab", { name: "Lift Up" }).click();
    await expect(page.getByText("Your soul clings to the dust with your eyes cast down. Lift them up.")).toBeVisible();
  });

  test("a Journey week: no Passage tab, sub-headings, commentary, a question with no word study, closing essay", async ({ page }) => {
    // Lesson 4 "Week 3: The Crack Itself" is shaped like the Journey's Parts One to Three.
    await page.goto("/studies/qa-study-not-started");
    await page.getByRole("link", { name: /Week 3: The Crack Itself/ }).click();
    await expect(page).toHaveURL(/\/studies\/qa-study-not-started\/[^/]+$/);

    // No passage printed, so no Passage tab.
    const tablist = page.getByRole("tablist", { name: "Week sections" });
    await expect(tablist.getByRole("tab")).toHaveCount(4);
    await expect(tablist.getByRole("tab", { name: "Passage", exact: true })).toHaveCount(0);

    // Study: the key verse is Psalm 119:25, shown once; a Part's sub-heading.
    await expect(page.getByText("My soul clings to the dust; Revive me according to Your word.")).toHaveCount(1);
    await page.getByRole("button", { name: /God’s Mercy in the Crack/ }).click();
    await expect(page.getByRole("heading", { name: "WHEN THE CRACK IS OBVIOUS" })).toBeVisible();

    // Work the Word: commentary, then the question; two word studies on one station.
    await page.getByRole("tab", { name: "Work the Word" }).click();
    await expect(page.getByText("John writes this whole letter to people who already believe.")).toBeVisible();
    await page.getByRole("button", { name: "Open the Greek · παράκλητος" }).click();
    await expect(page.getByText("Going Deeper · The Hebrew")).toBeVisible();
    await expect(page.getByText("Fixture second word study.")).toBeVisible();
    // The second station only asks a question: no word study to open.
    await page.getByRole("tab", { name: "Station 2" }).click();
    await expect(page.getByText("Where do you need to turn back this week?")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Open the / })).toHaveCount(0);

    // Both stations quote 1 John 2:1. An answer typed in one stays with that
    // one: the second station's box starts empty, and the first keeps its own.
    await page.getByRole("tab", { name: "Station 1" }).click();
    const box = page.getByRole("textbox");
    await box.fill("Answer for the first station.");
    await page.getByRole("tab", { name: "Station 2" }).click();
    await expect(page.getByText("Where do you need to turn back this week?")).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveValue("");
    await page.getByRole("tab", { name: "Station 1" }).click();
    await expect(page.getByRole("textbox")).toHaveValue("Answer for the first station.");

    // Live It: the closing essay, the Extra Practical box, the prayer's printed label.
    await page.getByRole("tab", { name: "Live It" }).click();
    await expect(page.getByText("MOVEMENT ONE CLOSING")).toBeVisible();
    await expect(page.getByRole("heading", { name: "WHERE YOU ARE GOING" })).toBeVisible();
    await expect(page.getByText("FAST FROM ONE COPING MECHANISM")).toBeVisible();
    await expect(page.getByRole("heading", { name: "A SIMPLE DAILY PRAYER" })).toBeVisible();

    // Lift Up: a benediction signed rather than closed with a verse shows no empty verse card.
    await page.getByRole("tab", { name: "Lift Up" }).click();
    await expect(page.getByText("What would you see if you stopped patching the crack?")).toBeVisible();
    const liftUp = page.locator('[role="tabpanel"]:not([hidden])');
    await expect(liftUp.locator("div.bg-white")).toHaveCount(0);
  });

  test("a week with saved progress reloads without a hydration mismatch", async ({ page }) => {
    // Progress (tabs done, parts read, practices checked) lives only in the
    // browser. The server can't know it, so the first render has to match
    // the server's "nothing done" and pick saved progress up afterward;
    // reading it during that first render made React throw error #418.
    const hydrationErrors: string[] = [];
    const isHydration = (text: string) => /hydrat|#418|#423|#425|did not match/i.test(text);
    page.on("console", (msg) => {
      if (msg.type() === "error" && isHydration(msg.text())) hydrationErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      if (isHydration(err.message)) hydrationErrors.push(err.message);
    });

    await openLesson1(page);
    await page.getByRole("button", { name: /Part 1/ }).click();
    await expect(page.getByText("1 of 2 parts read")).toBeVisible();
    await page.getByRole("button", { name: "Done with the reading" }).click();
    await expect(page.getByRole("button", { name: "✓ Done with the reading" })).toBeVisible();
    await page.getByRole("tab", { name: "Live It" }).click();
    await page.getByRole("checkbox").first().check();

    hydrationErrors.length = 0;
    await page.reload();
    // Saved progress still shows once the page has loaded.
    await expect(page.getByText("1 of 2 parts read")).toBeVisible();
    await expect(page.getByRole("button", { name: "✓ Done with the reading" })).toBeVisible();
    await expect(page.getByText("20%")).toBeVisible();
    await page.getByRole("tab", { name: "Live It" }).click();
    await expect(page.getByRole("checkbox").first()).toBeChecked();
    expect(hydrationErrors).toEqual([]);
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
