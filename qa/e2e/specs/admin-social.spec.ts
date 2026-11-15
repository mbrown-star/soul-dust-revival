import { test, expect } from "@playwright/test";

// app/admin/social/new/page.tsx: platform checkboxes + live per-platform
// character counts (x/facebook/instagram), Instagram-requires-image guard
// on the submit button (`canSubmit`), confirmed by reading the real source.
test.describe("Admin: Social scheduling", () => {
  test.describe("as qa-admin", () => {
    test.use({ storageState: "qa/.auth/admin.json" });

    test("composer shows all 3 platform checkboxes with live character counts", async ({ page }) => {
      await page.goto("/admin/social/new");
      await expect(page.getByText("X: 0/280")).toBeVisible();
      await expect(page.getByText("Facebook: 0/63206")).toBeVisible();
      await expect(page.getByText("Instagram: 0/2200")).toBeVisible();

      const body = page.locator("textarea");
      await body.fill("Hello from the QA suite");
      await expect(page.getByText(`X: ${"Hello from the QA suite".length}/280`)).toBeVisible();
    });

    test("X's count turns to the error color once the body exceeds 280 characters", async ({ page }) => {
      await page.goto("/admin/social/new");
      const longBody = "a".repeat(281);
      await page.locator("textarea").fill(longBody);
      const xCount = page.getByText(`X: 281/280`);
      await expect(xCount).toBeVisible();
      await expect(xCount).toHaveClass(/text-error/);
    });

    test("selecting Instagram with no image blocks submit and shows the requirement", async ({ page }) => {
      await page.goto("/admin/social/new");
      await page.locator("textarea").fill("A QA fixture post body.");
      // The Instagram checkbox is the 3rd platform row's checkbox.
      await page.getByRole("checkbox").nth(2).check();
      await expect(page.getByText("Instagram requires an image.")).toBeVisible();
      await expect(page.getByRole("button", { name: /Schedule post/i })).toBeDisabled();
    });

    test("selecting a platform with an empty body also blocks submit", async ({ page }) => {
      await page.goto("/admin/social/new");
      await page.getByRole("checkbox").first().check(); // X
      await expect(page.getByRole("button", { name: /Schedule post/i })).toBeDisabled();
    });

    test.describe("in the browser's own time zone", () => {
      test.use({ timezoneId: "America/New_York" });

      test("composer labels the time with the local zone and gives the UTC equivalent", async ({ page }) => {
        await page.goto("/admin/social/new");
        await page.getByRole("checkbox").first().check(); // X
        await expect(page.getByText(/Time \(America\/New_York \(E[SD]T\)\)/)).toBeVisible();
        const date = page.locator('input[type="date"]').first();
        await date.fill("2030-01-15");
        await page.locator('input[type="time"]').first().fill("09:00");
        await expect(page.getByText(/First goes out .*Jan 15.*9:00.*\(14:00 UTC\)/)).toBeVisible();
      });
    });

    test("composer flags a time that has already passed", async ({ page }) => {
      await page.goto("/admin/social/new");
      await page.getByRole("checkbox").first().check();
      await page.locator('input[type="date"]').first().fill("2020-01-01");
      await expect(page.getByText(/has already passed, so this goes out on the next run/)).toBeVisible();
    });

    test("Publish now saves the post and reports a platform that can't publish", async ({ page }) => {
      // The QA database has no connected accounts, so this exercises the whole
      // path without posting anywhere: the X target is saved, claimed, and
      // comes back failed with the reason.
      await page.goto("/admin/social/new");
      const body = `QA publish-now ${Date.now()}`;
      await page.locator("textarea").fill(body);
      await page.getByRole("checkbox").first().check();
      page.once("dialog", (d) => d.accept());
      await page.getByRole("button", { name: "Publish now" }).click();
      const alert = page.getByRole("alert").filter({ hasText: "some platforms didn't publish" });
      await expect(alert).toContainText("X: X isn't connected. Connect it in Settings → Connections.");

      await page.goto("/admin/social");
      const row = page.locator("div.p-4", { hasText: body });
      await expect(row.getByText("X · failed")).toBeVisible();
      await expect(row.getByText("X isn't connected. Connect it in Settings → Connections.")).toBeVisible();
      await expect(row.getByRole("button", { name: "Publish now to X" })).toBeVisible();
    });

    test("social list page renders without error and shows a new-post link", async ({ page }) => {
      const res = await page.goto("/admin/social");
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("link", { name: /New post/i })).toBeVisible();
    });
  });

  // Minimal guard coverage kept here too in case admin-access-control.spec.ts
  // (another fork's file) doesn't end up covering these two routes --
  // harmless duplication if it does.
  test("guest is redirected away from /admin/social", async ({ page }) => {
    await page.goto("/admin/social");
    await expect(page).toHaveURL(/\/login/);
  });

  test.describe("as qa-user (role=user)", () => {
    test.use({ storageState: "qa/.auth/user.json" });
    test("is blocked from /admin/social/new", async ({ page }) => {
      await page.goto("/admin/social/new");
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe("as qa-leader (role=leader)", () => {
    test.use({ storageState: "qa/.auth/leader.json" });
    test("is blocked from /admin/social", async ({ page }) => {
      await page.goto("/admin/social");
      await expect(page).toHaveURL(/\/login/);
    });
  });
});
