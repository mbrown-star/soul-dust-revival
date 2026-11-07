import { test, expect } from "@playwright/test";

// NOTE: app/(marketing)/account/AccountPageClient.tsx has NO order-history
// list at all -- just email, a data-export download, and the account
// deletion safeguard. This spec tests what actually exists; see
// qa/checklists/02-auth-and-account.md's "Information-consistency checks"
// for why the absence of order history here (despite qa-user having real
// paid + pending orders) is flagged as a UX gap candidate, not a bug this
// spec should assume away.

test.describe("Account page", () => {
  test.use({ storageState: "qa/.auth/user.json" });

  test("shows the real logged-in email", async ({ page }) => {
    await page.goto("/account");
    await expect(page.locator("body")).toContainText("qa-user@soul-dust-revival.test");
  });

  test("has no order-history list, despite the account having real orders", async ({ page }) => {
    await page.goto("/account");
    await expect(page.locator("body")).not.toContainText(/Order #/i);
  });

  test("data export endpoint returns a JSON file covering the areas the UI promises", async ({ request }) => {
    const res = await request.get("/api/account/export");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/json/);
    const data = (await res.json()) as Record<string, unknown>;
    // The UI copy promises "profile, orders, study responses, and login
    // history" -- assert the export actually contains something for each,
    // not just that it returns 200.
    const keys = Object.keys(data).join(" ").toLowerCase();
    for (const expected of ["profile", "order", "respons", "login"]) {
      expect(keys).toContain(expected);
    }
  });

  test("delete safeguard requires typing DELETE exactly before the button enables", async ({ page }) => {
    await page.goto("/account");
    await page.getByRole("button", { name: "Delete my account" }).click();

    const confirmInput = page.getByLabel(/Type/);
    const deleteButton = page.getByRole("button", { name: /Permanently delete my account/i });
    await expect(deleteButton).toBeDisabled();

    await confirmInput.fill("delete"); // wrong case
    await expect(deleteButton).toBeDisabled();

    await confirmInput.fill("DELETE");
    await expect(deleteButton).toBeEnabled();

    // Do NOT click it -- this would really delete the qa-user fixture
    // account. Cancel instead to leave the fixture intact for other specs.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(confirmInput).toHaveCount(0);
  });
});
