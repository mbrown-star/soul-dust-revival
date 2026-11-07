import { test, expect } from "@playwright/test";

// Role/session-level access control. NOTE: two assumptions in the original
// task brief turned out not to match the real code, confirmed by reading
// it rather than guessing:
//  1. /account has NO server-side session guard at all (no layout.tsx
//     checks it, AccountPageClient.tsx only checks client-side via
//     supabase.auth.getUser()). A guest visiting /account directly gets a
//     200 and is stuck on "Loading..." forever, never redirected to
//     /login. This is asserted below as the REAL (surprising) behavior --
//     see qa/checklists/02-auth-and-account.md for why this is flagged as
//     a likely UX gap, not treated as already-correct.
//  2. Neither /login nor /signup redirect an already-authenticated visitor
//     away -- there's no guard in login/page.tsx, signup/page.tsx, or
//     AuthForm.tsx. A logged-in user can still open the form and request
//     another magic link. Asserted below as real behavior, flagged as a
//     minor UX nit in the checklist, not a security issue (SECURITY.md's
//     own entitlement/role checks don't depend on this).

test.describe("Guest (logged out)", () => {
  test("/library redirects to /login with a next param", async ({ page }) => {
    await page.goto("/library");
    await expect(page).toHaveURL(/\/login\?next=%2Flibrary|\/login\?next=\/library/);
  });

  test("/account does NOT redirect -- renders 200 and gets stuck on Loading (real, surprising behavior)", async ({ page }) => {
    const res = await page.goto("/account");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/account$/); // not redirected
    await expect(page.locator("body")).toContainText("Loading...");
  });

  test("/checkout/success with no orderId redirects home", async ({ page }) => {
    await page.goto("/checkout/success");
    await expect(page).toHaveURL("/");
  });

  test("/checkout/success with a made-up orderId also redirects home (no such order)", async ({ page }) => {
    await page.goto("/checkout/success?orderId=00000000-0000-0000-0000-000000000000");
    await expect(page).toHaveURL("/");
  });

  test("/login and /signup both render the real form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1")).toContainText("Log in");
    await page.goto("/signup");
    await expect(page.locator("h1")).toContainText("Create your account");
  });

  test("login with a clearly nonexistent email surfaces the documented account-enumeration trade-off, with no new widening", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/Email address/i).fill(`qa-nonexistent-${Date.now()}@soul-dust-revival.test`);
    await page.getByRole("button", { name: /Send login link/i }).click();
    // SECURITY_REVIEW.md: "/login revealing whether an email exists is a
    // documented trade-off. Do not widen it." This confirms the existing,
    // accepted behavior is unchanged -- not a new finding.
    // Next.js's own route-announcer div also carries role="alert" -- scope
    // to the one with real text.
    await expect(page.getByRole("alert").filter({ hasText: "account" })).toContainText(
      "We couldn't find an account for that email."
    );
    await expect(page.getByRole("link", { name: "Sign up instead" })).toBeVisible();
  });
});

test.describe("Role gating of /admin (already smoke-tested for products; broader sweep here)", () => {
  for (const path of ["/admin/products", "/admin/studies", "/admin/blog", "/admin/users", "/admin/reports"]) {
    test(`guest is redirected to /login from ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test.describe("as qa-user (role=user, not leader/admin)", () => {
    test.use({ storageState: "qa/.auth/user.json" });
    for (const path of ["/admin/products", "/admin/users", "/leader"]) {
      test(`is NOT granted access to ${path}`, async ({ page }) => {
        await page.goto(path);
        // /leader redirects to login only for a guest; for a logged-in
        // non-leader it renders an inline "this section is for group
        // leaders" message instead (see app/leader/layout.tsx) -- assert
        // the right behavior per route rather than assuming both redirect.
        if (path === "/leader") {
          await expect(page).toHaveURL(/\/leader$/);
          await expect(page.locator("body")).toContainText("This section is for group leaders");
        } else {
          await expect(page).toHaveURL(/\/login/);
        }
      });
    }
  });

  test.describe("as qa-leader (role=leader)", () => {
    test.use({ storageState: "qa/.auth/leader.json" });
    test("CAN reach /leader", async ({ page }) => {
      const res = await page.goto("/leader");
      expect(res?.status()).toBe(200);
      await expect(page.locator("body")).toContainText("QA Fixture: Published Leader Resource");
      await expect(page.locator("body")).not.toContainText("QA Fixture: Draft Leader Resource");
    });
    test("is still blocked from /admin/products (leader role alone is not admin)", async ({ page }) => {
      await page.goto("/admin/products");
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe("as qa-admin (role=admin)", () => {
    test.use({ storageState: "qa/.auth/admin.json" });
    test("can reach both /admin/products and /leader", async ({ page }) => {
      for (const path of ["/admin/products", "/leader"]) {
        const res = await page.goto(path);
        expect(res?.status()).toBe(200);
      }
    });
  });
});
