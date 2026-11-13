import { test, expect, type Page } from "@playwright/test";
import { Client } from "pg";

// Fixture: qa-sample-devotional (slug), 5 days (Jan 1-5), owned by nobody.
// Days 1-3 are the free sample (lessons.isSample); Days 4-5 are locked. Read
// as qa-leader, who owns nothing. The QA server runs the full site, so the
// locked wording is "with purchase" -- the sneak-peek build says "at launch
// and purchase" instead (unit-tested in lib/launchMode.test.ts).

// Day 4 is never a link for this reader, so its id comes from the isolated
// QA database (same approach as checkout.spec.ts).
async function lockedDay4Id(): Promise<string> {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error("TEST_DATABASE_URL must be set to run this spec.");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>(
      `SELECT l.id FROM lessons l JOIN studies s ON s.id = l.study_id
       WHERE s.slug = 'qa-sample-devotional' AND l.title LIKE 'DAY 4 ·%' AND l.is_sample = false`
    );
    if (rows.length !== 1) throw new Error("QA fixture: expected exactly one locked Day 4.");
    return rows[0]!.id;
  } finally {
    await client.end();
  }
}

test.describe("Free sample (sneak peek)", () => {
  test.use({ storageState: "qa/.auth/leader.json" });

  const STUDY = "/studies/qa-sample-devotional";

  async function lessonHref(page: Page, day: number): Promise<string> {
    await page.goto(STUDY);
    const href = await page.getByRole("link", { name: new RegExp(`DAY ${day} ·`, "i") }).getAttribute("href");
    expect(href).toBeTruthy();
    return href!;
  }

  test("My Library shows the sample with its locked count", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByText("QA Sample Devotional")).toBeVisible();
    await expect(page.getByText("2 more days unlock with purchase")).toBeVisible();
    await expect(page.getByText("0/3")).toBeVisible();
  });

  test("the lesson list links the sample days and locks the rest", async ({ page }) => {
    await page.goto(STUDY);
    await expect(page.getByText(/Sneak peek/)).toBeVisible();
    await expect(page.getByText("0/3 sample days")).toBeVisible();
    for (const day of [1, 2, 3]) {
      await expect(page.getByRole("link", { name: new RegExp(`DAY ${day} ·`, "i") })).toBeVisible();
    }
    for (const day of [4, 5]) {
      await expect(page.getByRole("link", { name: new RegExp(`DAY ${day} ·`, "i") })).toHaveCount(0);
      await expect(page.getByText(new RegExp(`DAY ${day} ·`, "i"))).toBeVisible();
    }
  });

  test("the last sample day ends with a locked card, and the Year view locks the rest", async ({ page }) => {
    await page.goto(await lessonHref(page, 3));
    await expect(page.getByText("Day 4 unlocks with purchase")).toBeVisible();

    await page.getByRole("tab", { name: "The Year" }).click();
    await expect(page.getByText("Day 4, January 4: locked")).toBeAttached();
    await expect(page.getByRole("link", { name: /^Day 1, January 1/ })).toBeVisible();
  });

  test("a locked day's URL sends the reader back to the lesson list", async ({ page }) => {
    await page.goto(`${STUDY}/${await lockedDay4Id()}`);
    await expect(page).toHaveURL(new RegExp(`${STUDY}$`));
  });

  test("progress saves on a sample day and is refused on a locked one", async ({ page }) => {
    const day1 = (await lessonHref(page, 1)).split("/").pop()!;
    const ok = await page.request.post("/api/progress", { data: { lessonId: day1, status: "in_progress" } });
    expect(ok.status()).toBe(200);
    const refused = await page.request.post("/api/progress", { data: { lessonId: await lockedDay4Id(), status: "in_progress" } });
    expect(refused.status()).toBe(403);
  });
});
