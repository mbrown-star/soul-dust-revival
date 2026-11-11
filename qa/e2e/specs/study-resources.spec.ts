import { test, expect } from "@playwright/test";

// A study's downloadable resources (study_resources). Fixtures in
// qa/scripts/seed-qa.ts: two on qa-study-not-started (owned by qa-user), one on
// qa-sample-devotional (owned by nobody; qa-leader reads its free sample).
// Downloads redirect to a signed R2 link; the fixture files don't exist, so
// these check the redirect, not the bytes.

test.describe("as the study's owner", () => {
  test.use({ storageState: "qa/.auth/user.json" });

  test("the study page lists its resources in order, each with a Download link", async ({ page }) => {
    await page.goto("/studies/qa-study-not-started");
    const section = page.getByRole("region", { name: "Resources" });
    await expect(section).toBeVisible();
    const items = section.getByRole("listitem");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText("QA Scriptural Catalog");
    await expect(items.nth(0)).toContainText("A companion list of every benediction");
    await expect(items.nth(0)).toContainText("PDF · 89 KB");
    await expect(items.nth(1)).toContainText("QA Leader Guide");
    await expect(items.nth(1)).toContainText("PDF · 2 MB");
    await expect(section.getByRole("link", { name: /^Download QA Scriptural Catalog/ })).toBeVisible();
  });

  test("Download sends the owner to a short-lived signed link that saves under the file's name", async ({ page }) => {
    await page.goto("/studies/qa-study-not-started");
    const href = await page.getByRole("link", { name: /^Download QA Scriptural Catalog/ }).getAttribute("href");
    expect(href).toMatch(/^\/api\/study-resources\/[0-9a-f-]{36}$/);

    const res = await page.request.get(href!, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    const location = new URL(res.headers().location!);
    expect(location.hostname).toMatch(/r2\.cloudflarestorage\.com$/);
    expect(location.pathname).toContain("study-resources/00000000-0000-4000-8000-000000000001.pdf");
    expect(location.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(location.searchParams.get("response-content-disposition")).toContain('filename="QA Scriptural Catalog.pdf"');
    expect(res.headers()["cache-control"]).toBe("private, no-store");
  });
});

test.describe("as a free-sample reader", () => {
  test.use({ storageState: "qa/.auth/leader.json" });

  test("sees the resource listed but locked, with no Download link", async ({ page }) => {
    await page.goto("/studies/qa-sample-devotional");
    const section = page.getByRole("region", { name: "Resources" });
    await expect(section).toContainText("QA Sample Companion");
    await expect(section).toContainText(/Unlocks (with purchase|at launch and purchase)/);
    await expect(section.getByRole("link", { name: /Download/ })).toHaveCount(0);
  });

  test("can't download a resource of a study they don't own", async ({ page }) => {
    await page.goto("/studies/qa-sample-devotional");
    // The id isn't on the page for a locked resource; take one the owner sees.
    const ownerPage = await page.context().browser()!.newContext({ storageState: "qa/.auth/user.json" }).then((c) => c.newPage());
    await ownerPage.goto("/studies/qa-study-not-started");
    const href = await ownerPage.getByRole("link", { name: /^Download QA Scriptural Catalog/ }).getAttribute("href");
    await ownerPage.context().close();

    const res = await page.request.get(href!, { maxRedirects: 0 });
    expect(res.status()).toBe(403);
  });
});

test.describe("signed out", () => {
  test("a Download link sends a visitor to sign in", async ({ page, browser }) => {
    const owner = await browser.newContext({ storageState: "qa/.auth/user.json" });
    const ownerPage = await owner.newPage();
    await ownerPage.goto("/studies/qa-study-not-started");
    const href = await ownerPage.getByRole("link", { name: /^Download QA Scriptural Catalog/ }).getAttribute("href");
    await owner.close();

    const res = await page.request.get(href!, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toContain("/login?next=%2Fstudies%2Fqa-study-not-started");
  });
});

test.describe("the Resources panel, as qa-admin", () => {
  test.use({ storageState: "qa/.auth/admin.json" });

  async function openStudy(page: import("@playwright/test").Page) {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: /QA Colossians-Shaped Study/i }).click();
    await expect(page).toHaveURL(/\/admin\/studies\/[0-9a-f-]+$/);
    await page.waitForLoadState("networkidle");
  }

  test("lists the study's resources and saves an edit and a reorder", async ({ page }) => {
    await openStudy(page);
    await expect(page.getByRole("heading", { name: "Resources" })).toBeVisible();
    await expect(page.getByText("QA Scriptural Catalog.pdf · PDF · 89 KB")).toBeVisible();

    // Move the guide up, reload, and it stays first.
    await page.getByRole("button", { name: "Move QA Leader Guide up" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Moved QA Leader Guide up." })).toBeAttached();
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("list", { name: "Study resources" }).getByRole("listitem").first()).toContainText("QA Leader Guide");

    // Rename it (while editing, the title is in an input, so the field is
    // found within the list rather than by the row's text), then put both back.
    const list = page.getByRole("list", { name: "Study resources" });
    await list.getByRole("listitem").filter({ hasText: "QA Leader Guide" }).getByRole("button", { name: "Edit", exact: true }).click();
    await list.getByLabel("Title").fill("QA Leader Guide (edited)");
    await list.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("QA Leader Guide (edited)", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("QA Leader Guide (edited)", { exact: true })).toBeVisible();
    await list.getByRole("listitem").filter({ hasText: "QA Leader Guide (edited)" }).getByRole("button", { name: "Edit", exact: true }).click();
    await list.getByLabel("Title").fill("QA Leader Guide");
    await list.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("QA Leader Guide (edited)", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Move QA Leader Guide down" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Moved QA Leader Guide down." })).toBeAttached();
  });

  test("an empty PDF field keeps Add resource disabled", async ({ page }) => {
    await openStudy(page);
    await page.getByLabel("Title", { exact: true }).last().fill("Something");
    await expect(page.getByRole("button", { name: "Add resource" })).toBeDisabled();
  });
});
