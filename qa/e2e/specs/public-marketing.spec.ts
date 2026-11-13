import { test, expect } from "@playwright/test";

// Public storefront: homepage, /store listing + detail, /blog, /privacy,
// and the nav bar's guest/logged-in states. /leader is NOT public -- it's
// gated by requireLeaderOrAdmin() (see leader/layout.tsx) and is covered in
// admin specs' access-control coverage instead, not here.

test.describe("Homepage", () => {
  test("shows featured products but never the inactive one", async ({ page }) => {
    await page.goto("/");
    const body = page.locator("body");
    // QA Digital Study (not started) and QA Bundle are seeded featured:true.
    await expect(body).toContainText("QA Digital Study — Not Started");
    await expect(body).toContainText("QA Bundle — Both Formats");
    await expect(body).not.toContainText("QA Inactive Product");
  });

  test("featured product tiles link to their detail page with the real price", async ({ page }) => {
    await page.goto("/");
    const tile = page.getByRole("link", { name: /QA Digital Study — Not Started/ });
    await expect(tile).toContainText("$19.00");
    await tile.click();
    await expect(page).toHaveURL(/\/store\/qa-digital-study-not-started/);
  });

  test("shows the 'From the blog' section with only published posts", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toContainText("QA Fixture: Published Post");
    await expect(page.locator("body")).not.toContainText("QA Fixture: Draft Post");
  });
});

test.describe("/store listing", () => {
  test("lists every active QA product and excludes the inactive one", async ({ page }) => {
    await page.goto("/store");
    const body = page.locator("body");
    for (const title of [
      "QA Digital Study — Not Started",
      "QA Devotional — In Progress",
      "QA Study — Completed",
      "QA Physical Book — Amazon + Stripe",
      "QA Physical Book — Amazon Only",
      "QA Bundle — Both Formats",
    ]) {
      await expect(body).toContainText(title);
    }
    await expect(body).not.toContainText("QA Inactive Product");
  });

  test("Type filter and search narrow the listing and stay in the URL", async ({ page }) => {
    await page.goto("/store");
    const type = page.getByRole("group", { name: "Type" });

    await type.getByRole("button", { name: /^Devotionals/ }).click();
    await expect(page.getByText("QA Devotional — In Progress")).toBeVisible();
    await expect(page.getByText("QA Physical Book — Amazon Only")).toHaveCount(0);
    await expect(page.getByText(/Showing 1 of \d+ titles/)).toBeVisible();
    await expect(page).toHaveURL(/type=devotional/);

    // Reloading keeps the filter (the server reads the same URL).
    await page.reload();
    await expect(type.getByRole("button", { name: /^Devotionals/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("QA Physical Book — Amazon Only")).toHaveCount(0);

    await type.getByRole("button", { name: /^All/ }).click();
    await page.getByRole("searchbox", { name: "Search" }).fill("amazon only");
    await expect(page.getByText("QA Physical Book — Amazon Only")).toBeVisible();
    await expect(page.getByText("QA Physical Book — Amazon + Stripe")).toHaveCount(0);

    await page.getByRole("searchbox", { name: "Search" }).fill("no such title anywhere");
    await expect(page.getByText("Nothing matches those filters.")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).first().click();
    await expect(page.getByText("QA Physical Book — Amazon + Stripe")).toBeVisible();
  });

  test("Sort brings Coming Soon or Available Now titles to the top and stays in the URL", async ({ page }) => {
    await page.goto("/store");
    const sort = page.getByRole("group", { name: "Sort" });
    const titles = page.locator("main h2");
    await expect(sort.getByRole("button", { name: "New" })).toHaveAttribute("aria-pressed", "true");

    await sort.getByRole("button", { name: "Coming Soon" }).click();
    await expect(titles.first()).toHaveText("QA Coming Soon Book");
    await expect(page).toHaveURL(/sort=coming_soon/);
    // Sorting reorders; it doesn't hide anything or count as a filter.
    await expect(page.getByText("QA Physical Book — Amazon Only")).toBeVisible();
    await expect(page.getByText(/Showing \d+ of/)).toHaveCount(0);

    await page.reload();
    await expect(sort.getByRole("button", { name: "Coming Soon" })).toHaveAttribute("aria-pressed", "true");
    await expect(titles.first()).toHaveText("QA Coming Soon Book");

    await sort.getByRole("button", { name: "Available Now" }).click();
    await expect(titles.last()).toHaveText("QA Coming Soon Book");
    await expect(page).toHaveURL(/sort=available/);
  });

  test("the inactive product's own page 404s even if visited directly by slug", async ({ page }) => {
    const res = await page.goto("/store/qa-inactive-product");
    expect(res?.status()).toBe(404);
  });
});

test.describe("/store/[slug] detail page — purchase routing per format", () => {
  test("Amazon + Stripe physical book shows both buttons", async ({ page }) => {
    await page.goto("/store/qa-physical-amazon-and-stripe");
    await expect(page.getByRole("button", { name: /Buy Now/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Buy on Amazon/i })).toBeVisible();
  });

  test("Amazon-only physical book shows only the Amazon button, no Stripe add-to-cart", async ({ page }) => {
    await page.goto("/store/qa-physical-amazon-only");
    await expect(page.getByRole("link", { name: /Buy on Amazon/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Buy Now/i })).toHaveCount(0);
  });

  test("'both' format bundle shows two independent purchase options with distinct prices", async ({ page }) => {
    await page.goto("/store/qa-bundle-both-formats");
    const body = page.locator("body");
    await expect(body).toContainText("Printed book");
    await expect(body).toContainText("Digital access");
    // Physical price ($24.99) and digital price ($15.99) are independent --
    // both must render, and must not be equal to each other.
    await expect(body).toContainText("$24.99");
    await expect(body).toContainText("$15.99");
    await expect(page.getByRole("button", { name: /Buy the book/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Buy digital access/i })).toBeVisible();
  });

  test("digital-only study shows the digital account-required copy", async ({ page }) => {
    await page.goto("/store/qa-digital-study-not-started");
    await expect(page.locator("body")).toContainText("Digital studies require an account");
  });
});

test.describe("/blog", () => {
  test("listing shows only published posts", async ({ page }) => {
    await page.goto("/blog");
    await expect(page.locator("body")).toContainText("QA Fixture: Published Post");
    await expect(page.locator("body")).not.toContainText("QA Fixture: Draft Post");
  });

  test("a published post renders sanitized rich text", async ({ page }) => {
    await page.goto("/blog/qa-fixture-published-post");
    await expect(page.locator("article")).toContainText("A QA fixture blog post");
    // Bold/link survive sanitization -- confirms DOMPurify/sanitize-html
    // isn't stripping legitimate formatting, only dangerous content.
    await expect(page.locator("article strong")).toContainText("bold");
    await expect(page.locator("article a[href='https://example.com']")).toBeVisible();
  });

  test("a draft post 404s for a logged-out visitor by direct URL", async ({ page }) => {
    const res = await page.goto("/blog/qa-fixture-draft-post");
    expect(res?.status()).toBe(404);
  });
});

test.describe("/privacy", () => {
  test("renders without needing auth", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("h1")).toContainText("Privacy Policy");
  });
});

// Audit 2026-11-13 fixes: the footer named the Store "Books & Studies" and
// had no Contact link; unknown URLs showed Next's bare 404; the public nav
// had no mark on the current section.
test.describe("Footer links", () => {
  test("names the Store as the nav does and links Contact for everyone", async ({ page }) => {
    await page.goto("/blog");
    const footer = page.getByRole("navigation", { name: "Footer" });
    await expect(footer.getByRole("link", { name: "Store" })).toHaveAttribute("href", "/store");
    await expect(footer.getByRole("link", { name: "Books & Studies" })).toHaveCount(0);
    await expect(footer.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/contact");
    await expect(page.locator("footer")).toContainText("My soul clings to the dust");
  });
});

test.describe("Not-found page", () => {
  test("an unknown address keeps the site header and offers a way back", async ({ page }) => {
    const res = await page.goto("/no-such-page-anywhere");
    expect(res?.status()).toBe(404);
    await expect(page).toHaveTitle(/Page not found/);
    await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Footer" })).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: "Home" })).toBeVisible();
  });

  test("an unknown product does too", async ({ page }) => {
    const res = await page.goto("/store/does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  });
});

test.describe("Nav current section", () => {
  test("marks the section being viewed", async ({ page }, testInfo) => {
    await page.goto("/blog");
    const nav = page.getByRole("navigation", { name: "Primary" });
    if (testInfo.project.name === "mobile-chromium") {
      await nav.getByRole("button", { name: "Open menu" }).click();
      await expect(page.getByRole("menuitem", { name: "Blog" })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("menuitem", { name: "Store" })).not.toHaveAttribute("aria-current", "page");
    } else {
      await expect(nav.getByRole("link", { name: "Blog" })).toHaveAttribute("aria-current", "page");
      await expect(nav.getByRole("link", { name: "Store" })).not.toHaveAttribute("aria-current", "page");
    }
  });
});

test.describe("Footer account links", () => {
  test("guest sees Log in and Sign up, not App or Account", async ({ page }) => {
    await page.goto("/blog");
    const footer = page.getByRole("navigation", { name: "Footer" });
    await expect(footer.getByRole("link", { name: "Log in" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Sign up" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "App" })).toHaveCount(0);
    await expect(footer.getByRole("link", { name: "Account" })).toHaveCount(0);
  });

  test.describe("as qa-user", () => {
    test.use({ storageState: "qa/.auth/user.json" });
    // Audit 2026-11-13: the footer offered Log in and Sign up to people
    // already signed in.
    test("sees App and Account, not Log in or Sign up", async ({ page }) => {
      await page.goto("/blog");
      const footer = page.getByRole("navigation", { name: "Footer" });
      await expect(footer.getByRole("link", { name: "App" })).toBeVisible();
      await expect(footer.getByRole("link", { name: "Account" })).toBeVisible();
      await expect(footer.getByRole("link", { name: "Log in" })).toHaveCount(0);
      await expect(footer.getByRole("link", { name: "Sign up" })).toHaveCount(0);
    });
  });
});

test.describe("Nav bar", () => {
  // SiteNav.tsx renders two genuinely different structures depending on
  // viewport (hidden sm:flex / sm:hidden, not just a CSS reflow of the same
  // markup): the chromium project (desktop width) sees plain links and a
  // "Profile" dropdown button; mobile-chromium (412px, below the sm:
  // breakpoint) sees a single hamburger button whose menu holds everything,
  // including the items a "Profile" dropdown would hold on desktop. Every
  // item inside either menu has an explicit role="menuitem" (overriding its
  // element's implicit role), so it's queried by that role, not "link".
  const isMobile = (testInfo: { project: { name: string } }) => testInfo.project.name === "mobile-chromium";

  test("guest sees Store, Blog, Cart, Log in -- not App or an account menu", async ({ page }, testInfo) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });

    if (isMobile(testInfo)) {
      await nav.getByRole("button", { name: "Open menu" }).click();
      await expect(page.getByRole("menuitem", { name: "Store" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "Blog" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "Log in" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "App" })).toHaveCount(0);
    } else {
      await expect(nav.getByRole("link", { name: "Store" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Blog" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Log in" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "App" })).toHaveCount(0);
    }
  });

  test.describe("as qa-user", () => {
    test.use({ storageState: "qa/.auth/user.json" });
    test("sees App and an Account menu without Admin", async ({ page }, testInfo) => {
      // FIXED (qa/findings/FINDINGS_2026-11-07.md #1, extended): the
      // original fix kept "Profile" reachable outside the scrollable strip
      // the other items could overflow into; the hamburger rewrite removes
      // that strip (and the scrolling) entirely, since it gave no visual
      // hint there was anything to scroll to in the first place -- verified
      // on both the desktop and mobile-chromium projects, not just desktop.
      await page.goto("/");
      const nav = page.getByRole("navigation", { name: "Primary" });

      if (isMobile(testInfo)) {
        const menuButton = nav.getByRole("button", { name: "Open menu" });
        const box = await menuButton.boundingBox();
        expect(box, "menu button should have a layout box").not.toBeNull();
        expect(box!.x + box!.width).toBeLessThanOrEqual(testInfo.project.use.viewport!.width!);

        await menuButton.click();
        await expect(page.getByRole("menuitem", { name: "App" })).toBeVisible();
        await expect(page.getByRole("menuitem", { name: "Account" })).toBeVisible();
        await expect(page.getByRole("menuitem", { name: "Admin" })).toHaveCount(0);
        return;
      }

      await expect(nav.getByRole("link", { name: "App" })).toBeVisible();
      const profileButton = nav.getByRole("button", { name: /Profile/i });

      const box = await profileButton.boundingBox();
      expect(box, "Profile button should have a layout box").not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(testInfo.project.use.viewport!.width!);

      await profileButton.click();
      await expect(page.getByRole("menuitem", { name: "Account" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "Admin" })).toHaveCount(0);
    });
  });

  test.describe("as qa-admin", () => {
    test.use({ storageState: "qa/.auth/admin.json" });
    test("sees an Admin item in the menu", async ({ page }, testInfo) => {
      await page.goto("/");
      const nav = page.getByRole("navigation", { name: "Primary" });
      const buttonName = isMobile(testInfo) ? "Open menu" : /Profile/i;
      await nav.getByRole("button", { name: buttonName }).click();
      await expect(page.getByRole("menuitem", { name: "Admin" })).toBeVisible();
    });
  });
});
