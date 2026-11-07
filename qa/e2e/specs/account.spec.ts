import { test, expect } from "@playwright/test";

// FIXED (qa/findings/FINDINGS_2026-11-07.md #5 and #6): /account previously
// had no server-side session guard at all (a guest got stuck on
// "Loading..." forever) and no order-history UI despite qa-user having real
// paid + pending orders. app/(marketing)/account/page.tsx now redirects a
// guest to /login?next=/account and fetches the account's real orders
// server-side, passed to AccountPageClient as a prop (no more client-side
// loading gate for the email either).

test.describe("Account page", () => {
  test("guest is redirected to login, not stuck on a perpetual loading state", async ({ page }) => {
    const res = await page.goto("/account");
    expect(res?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/login\?next=\/account/);
  });

  test.describe("as qa-user", () => {
    test.use({ storageState: "qa/.auth/user.json" });

    test("shows the real logged-in email", async ({ page }) => {
      await page.goto("/account");
      await expect(page.locator("body")).toContainText("qa-user@soul-dust-revival.test");
    });

    test("shows real order history with correct statuses and totals", async ({ page }) => {
      await page.goto("/account");
      // Seeded: one paid order for the Not-Started study ($19.00), one
      // pending order for the Amazon+Stripe book ($16.99), plus the
      // dedicated 'both'-format order used by checkout.spec.ts's pricing
      // regression test -- see qa/CONVENTIONS.md's fixture table.
      const digitalStudyRow = page.getByRole("listitem").filter({ hasText: "QA Digital Study — Not Started" });
      await expect(digitalStudyRow.getByText("$19.00")).toBeVisible();
      await expect(digitalStudyRow.getByText("Paid", { exact: true })).toBeVisible();

      const amazonBookRow = page.getByRole("listitem").filter({ hasText: "QA Physical Book — Amazon + Stripe" });
      await expect(amazonBookRow.getByText("$16.99")).toBeVisible();
      await expect(amazonBookRow.getByText("Pending", { exact: true })).toBeVisible();
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

  test.describe("as qa-leader (no orders seeded)", () => {
    test.use({ storageState: "qa/.auth/leader.json" });

    test("shows the no-orders empty state, not an error", async ({ page }) => {
      await page.goto("/account");
      await expect(page.getByText("You haven't placed an order yet.")).toBeVisible();
    });
  });
});
