import { test, expect } from "@playwright/test";

// Every /admin/* page is gated by ONE place: app/admin/layout.tsx's
// `requireAdmin()` call, which redirects to `/login?next=/admin/products`
// (always that fixed next= target, regardless of which admin page was
// requested -- see the layout's own comment). Every /api/admin/* route
// gates independently via the same requireAdmin() and returns a 403 JSON
// body (no redirect) when it fails. This spec exercises both gates across
// every real admin page/route for all four roles, since CLAUDE.md and
// SECURITY_REVIEW.md both call this out as the single source of truth that
// must never be bypassed.

const ADMIN_PAGES = [
  "/admin/products",
  "/admin/products/new",
  "/admin/leader-resources",
  "/admin/blog",
  "/admin/blog/new",
  "/admin/social",
  "/admin/social/new",
  "/admin/users",
  "/admin/reports",
  "/admin/reports/sales",
  "/admin/reports/engagement",
  "/admin/reports/social",
  "/admin/settings/connections",
];

// Routes needing a real id are filled in at runtime from fixture lookups
// (see the "with real ids" describe block below) rather than hardcoded here.

test.describe("admin access control", () => {
  test.describe("guest (logged out)", () => {
    for (const path of ADMIN_PAGES) {
      test(`${path} redirects to /login`, async ({ page }) => {
        await page.goto(path);
        await expect(page).toHaveURL(/\/login\?next=\/admin\/products/);
      });
    }
  });

  test.describe("as qa-user (role=user)", () => {
    test.use({ storageState: "qa/.auth/user.json" });
    for (const path of ADMIN_PAGES) {
      test(`${path} redirects to /login, not a silent allow`, async ({ page }) => {
        await page.goto(path);
        await expect(page).toHaveURL(/\/login\?next=\/admin\/products/);
      });
    }
  });

  test.describe("as qa-leader (role=leader) -- leader is NOT admin", () => {
    test.use({ storageState: "qa/.auth/leader.json" });
    for (const path of ADMIN_PAGES) {
      test(`${path} redirects to /login -- leader role alone must not grant admin access`, async ({ page }) => {
        await page.goto(path);
        await expect(page).toHaveURL(/\/login\?next=\/admin\/products/);
      });
    }
  });

  test.describe("as qa-admin", () => {
    test.use({ storageState: "qa/.auth/admin.json" });
    for (const path of ADMIN_PAGES) {
      test(`${path} is reachable (200, stays on the page)`, async ({ page }) => {
        const res = await page.goto(path);
        expect(res?.status()).toBe(200);
        await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
      });
    }
  });

  // Pages that need a real row id -- resolved via the admin UI itself
  // (list -> first matching link) rather than hardcoded ids, so this
  // doesn't break if seed-qa.ts's insert order changes.
  // Audit 2026-11-13: /admin itself returned 404.
  test.describe("/admin with no section", () => {
    test.describe("as qa-admin", () => {
      test.use({ storageState: "qa/.auth/admin.json" });
      test("opens Products", async ({ page }) => {
        await page.goto("/admin");
        await expect(page).toHaveURL(/\/admin\/products$/);
      });
    });
    test("sends a guest to sign in", async ({ page }) => {
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/login\?next=\/admin\/products/);
    });
  });

  test.describe("pages needing a real id, as qa-admin", () => {
    test.use({ storageState: "qa/.auth/admin.json" });

    test("a product edit page is reachable", async ({ page }) => {
      await page.goto("/admin/products");
      await page.getByText("QA Digital Study — Not Started").click();
      await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]+$/);
      await expect(page.locator("body")).not.toContainText("Forbidden");
    });

    test("a study edit page is reachable", async ({ page }) => {
      await page.goto("/admin/studies");
      await page.getByText("QA Colossians-Shaped Study").click();
      await expect(page).toHaveURL(/\/admin\/studies\/[0-9a-f-]+$/);
    });

    test("a study's lesson editor is reachable", async ({ page }) => {
      await page.goto("/admin/studies");
      await page.getByText("QA Colossians-Shaped Study").click();
      await page.getByRole("link", { name: /Week 1: Grace and Truth/i }).click();
      await expect(page).toHaveURL(/\/admin\/studies\/[0-9a-f-]+\/lessons\/[0-9a-f-]+$/);
    });

    test("a blog post edit page is reachable", async ({ page }) => {
      await page.goto("/admin/blog");
      await page.getByText("QA Fixture: Published Post").click();
      await expect(page).toHaveURL(/\/admin\/blog\/[0-9a-f-]+$/);
    });

    test("a leader resource edit page is reachable", async ({ page }) => {
      await page.goto("/admin/leader-resources");
      await page.getByText("QA Fixture: Published Leader Resource").click();
      await expect(page).toHaveURL(/\/admin\/leader-resources\/[0-9a-f-]+$/);
    });
  });

  test.describe("same pages, as qa-user -- a real id must not help", () => {
    test.use({ storageState: "qa/.auth/user.json" });

    test("a product edit page by direct id is still blocked", async ({ page }) => {
      // next/navigation's redirect() sends the browser on to /login, which
      // itself renders 200 -- the real signal that the id didn't help is the
      // final URL, not the status of whatever page it lands on.
      await page.goto("/admin/products/00000000-0000-0000-0000-000000000000");
      await expect(page).toHaveURL(/\/login\?next=\/admin\/products/);
    });
  });
});

test.describe("admin API route access control (a sample, not exhaustive)", () => {
  const API_ROUTES: { method: "GET" | "POST" | "PATCH"; path: string; body?: object }[] = [
    { method: "GET", path: "/api/admin/users" },
    { method: "POST", path: "/api/admin/products", body: {} },
    { method: "POST", path: "/api/admin/studies", body: {} },
    { method: "POST", path: "/api/admin/blog/posts", body: {} },
    { method: "POST", path: "/api/admin/leader-resources", body: {} },
    { method: "PATCH", path: "/api/admin/lessons", body: {} },
  ];

  test.describe("guest", () => {
    for (const { method, path, body } of API_ROUTES) {
      test(`${method} ${path} -> 403 Forbidden JSON`, async ({ request }) => {
        const res =
          method === "GET"
            ? await request.get(path)
            : await request.fetch(path, { method, data: body ?? {} });
        expect(res.status()).toBe(403);
        const json = await res.json();
        expect(json.error).toBe("Forbidden");
      });
    }
  });

  test.describe("as qa-user", () => {
    test.use({ storageState: "qa/.auth/user.json" });
    for (const { method, path, body } of API_ROUTES) {
      test(`${method} ${path} -> 403 Forbidden JSON, not a silent 200`, async ({ request }) => {
        const res =
          method === "GET"
            ? await request.get(path)
            : await request.fetch(path, { method, data: body ?? {} });
        expect(res.status()).toBe(403);
      });
    }
  });

  test.describe("as qa-leader", () => {
    test.use({ storageState: "qa/.auth/leader.json" });
    for (const { method, path, body } of API_ROUTES) {
      test(`${method} ${path} -> 403 Forbidden -- leader role must not grant admin API access`, async ({ request }) => {
        const res =
          method === "GET"
            ? await request.get(path)
            : await request.fetch(path, { method, data: body ?? {} });
        expect(res.status()).toBe(403);
      });
    }
  });

  test.describe("as qa-admin", () => {
    test.use({ storageState: "qa/.auth/admin.json" });
    test("GET /api/admin/users succeeds and never returns Forbidden", async ({ request }) => {
      const res = await request.get("/api/admin/users");
      expect(res.status()).toBe(200);
    });
  });
});

test.describe("Admin nav active-section indicator (qa/findings/FINDINGS_2026-11-07.md #10)", () => {
  test.use({ storageState: "qa/.auth/admin.json" });

  test("the current section's link is marked aria-current, others are not", async ({ page }) => {
    await page.goto("/admin/blog");
    const nav = page.getByRole("navigation", { name: "Admin" });
    await expect(nav.getByRole("link", { name: "Blog" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Products" })).not.toHaveAttribute("aria-current", "page");
  });

  test("a sub-route still highlights its own top-level section", async ({ page }) => {
    await page.goto("/admin/studies");
    await page.getByRole("link", { name: /QA Colossians-Shaped Study/i }).click();
    await expect(page).toHaveURL(/\/admin\/studies\/[0-9a-f-]+$/);
    await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Studies" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });
});
