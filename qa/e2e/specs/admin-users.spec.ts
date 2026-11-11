import { test, expect } from "@playwright/test";

test.describe("admin users & roles, as qa-admin", () => {
  test.use({ storageState: "qa/.auth/admin.json" });

  test("list includes all 3 QA fixture users with correct roles", async ({ page }) => {
    await page.goto("/admin/users");
    // The email also appears in an inline "Role for {email}" edit-form label
    // elsewhere on the page -- scope to the actual table row specifically.
    const userRow = page.getByRole("row", { name: /qa-user@soul-dust-revival\.test/i });
    const leaderRow = page.getByRole("row", { name: /qa-leader@soul-dust-revival\.test/i });
    const adminRow = page.getByRole("row", { name: /qa-admin@soul-dust-revival\.test/i });
    await expect(userRow).toContainText(/\buser\b/i);
    await expect(leaderRow).toContainText(/\bleader\b/i);
    await expect(adminRow).toContainText(/\badmin\b/i);
  });

  test("the page states the self-role-change rule in copy", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page.getByText(/can't change your own role here/i)).toBeVisible();
  });

  test("UI layer: the current admin's own row has no editable role control", async ({ page }) => {
    // UserRoleTable.tsx branches on `u.id === currentUserId` to render a
    // non-editable row for the signed-in admin -- confirmed by reading the
    // component. This verifies that branch actually reaches the DOM for the
    // real logged-in qa-admin, not just that it exists in source.
    await page.goto("/admin/users");
    const ownRow = page.getByText("qa-admin@soul-dust-revival.test").locator("..");
    await expect(ownRow.getByRole("combobox")).toHaveCount(0);
  });

  test("API layer: PATCHing qa-admin's own role is rejected even if attempted directly", async ({ page, request }) => {
    // Belt-and-suspenders check: the UI hides the control, but the API must
    // independently refuse this too (never trust the client alone).
    const usersRes = await request.get("/api/admin/users");
    const list = (await usersRes.json()) as { id: string; email: string }[];
    const self = list.find((u) => u.email === "qa-admin@soul-dust-revival.test");
    test.skip(!self, "Could not resolve qa-admin's id from the users API response.");
    const res = await request.fetch("/api/admin/users", {
      method: "PATCH",
      data: { userId: self!.id, role: "user" },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("cannot_change_own_role");
  });

  test("Delete opens a confirmation (with the block option) and Cancel leaves the user in place", async ({ page }) => {
    // Cancels rather than confirms: deleting or blocking calls the real
    // Supabase Auth project, which the route tests cover with a mock.
    await page.goto("/admin/users");
    await page.getByRole("button", { name: "Delete qa-user@soul-dust-revival.test" }).click();
    const confirm = page.getByRole("form", { name: "Delete qa-user@soul-dust-revival.test" });
    await expect(confirm).toContainText(/can't be undone/i);
    await confirm.getByLabel(/also block this email/i).check();
    await expect(confirm.getByRole("button", { name: "Delete and block" })).toBeVisible();
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("row", { name: /qa-user@soul-dust-revival\.test/i })).toBeVisible();
  });

  test("no Delete button on the admin's own row or another admin's", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page.getByRole("button", { name: "Delete qa-admin@soul-dust-revival.test" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete qa-leader@soul-dust-revival.test" })).toHaveCount(1);
  });

  test("Blocked emails section is on the page", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "Blocked emails" })).toBeVisible();
    await expect(page.getByRole("form", { name: "Block an email" })).toBeVisible();
  });
});

