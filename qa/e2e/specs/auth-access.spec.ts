import { test, expect } from "@playwright/test";

// Role/session-level access control.
//
// FIXED (qa/findings/FINDINGS_2026-11-07.md #5 and #7), both confirmed
// missing by the original audit and fixed in this same build:
//  1. /account now has a real server-side session guard
//     (app/(marketing)/account/page.tsx), matching every other gated page.
//  2. Both /login and /signup now redirect an already-authenticated visitor
//     straight to `next` instead of showing the form again.

test.describe("Guest (logged out)", () => {
  test("/library redirects to /login with a next param", async ({ page }) => {
    await page.goto("/library");
    await expect(page).toHaveURL(/\/login\?next=%2Flibrary|\/login\?next=\/library/);
  });

  // /account's session guard is covered directly in account.spec.ts.

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

test.describe("Already-authenticated visitor", () => {
  test.use({ storageState: "qa/.auth/user.json" });

  test("/login redirects to the default next (/library), not the form again", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/library$/);
  });

  test("/signup redirects to the default next (/library), not the form again", async ({ page }) => {
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/library$/);
  });

  // Deliberately NOT auto-redirected when a specific `next` is present --
  // see login/page.tsx's comment on the infinite-redirect-loop this would
  // otherwise risk for a `next` the session doesn't actually have access
  // to (e.g. a non-admin bounced here from /admin/products).
  test("/login?next=... still shows the form rather than blindly trusting an explicit next", async ({ page }) => {
    await page.goto("/login?next=/account");
    await expect(page).toHaveURL(/\/login\?next=\/account/);
    await expect(page.locator("h1")).toContainText("Log in");
  });
});

// Regression test for a real open-redirect this build's own already-
// authenticated-visitor fix (#7) could have introduced -- see
// lib/auth/safeRedirect.ts and its unit tests for the exhaustive
// path/URL-shape coverage (the actual exploit-prevention proof). Here,
// confirming the integration point: an explicit `next` (malicious or not)
// never auto-redirects at all while logged in -- see login/page.tsx's own
// comment on why (the infinite-loop fix's `!next` gate also happens to mean
// the vulnerable redirect() call can only ever fire with the hardcoded
// default, never a query-param value) -- so the form renders instead of
// following it anywhere.
test.describe("Open-redirect guard on /login and /signup's next param", () => {
  test.use({ storageState: "qa/.auth/user.json" });

  for (const path of ["/login", "/signup"]) {
    test(`${path}?next=https://evil.example renders the form, doesn't auto-redirect anywhere`, async ({ page }) => {
      await page.goto(`${path}?next=https://evil.example`);
      expect(new URL(page.url()).hostname).toBe("localhost");
      await expect(page.locator("h1")).toContainText(path === "/login" ? "Log in" : "Create your account");
    });
  }
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
