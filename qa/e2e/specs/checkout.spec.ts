import { test, expect, type APIRequestContext } from "@playwright/test";
import { Client } from "pg";

// Looks up a QA fixture product's real UUID by slug via a direct Postgres
// query against the isolated local test database -- needed only for the
// Amazon-only API-level guard test below, where the UI deliberately never
// renders a productId anywhere in the DOM for a sellOnStripe:false product
// (there's no Buy Now button to click), so the only way to exercise the
// server-side guard is to call /api/checkout directly with a crafted body.
async function productIdBySlug(slug: string): Promise<string> {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error("TEST_DATABASE_URL must be set to run this spec.");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query<{ id: string }>("SELECT id FROM products WHERE slug = $1", [slug]);
    if (res.rows.length === 0) throw new Error(`No QA fixture product with slug ${slug}`);
    return res.rows[0]!.id;
  } finally {
    await client.end();
  }
}

async function postCheckout(request: APIRequestContext, body: unknown) {
  return request.post("/api/checkout", { data: body });
}

test.describe("Checkout — logged-in digital purchase ('both' format bundle)", () => {
  test.use({ storageState: "qa/.auth/user.json" });

  test("adding both the physical and digital lines of a 'both' product shows two distinct line items and prices", async ({ page }) => {
    await page.goto("/store/qa-bundle-both-formats");
    await page.getByRole("button", { name: /Buy the book/i }).click();
    await page.getByRole("button", { name: /Buy digital access/i }).click();

    await page.goto("/checkout");
    const cartList = page.getByRole("list", { name: "Cart items" });
    await expect(cartList).toContainText("QA Bundle — Both Formats");
    // Two separate <li> line items for the same product (physical + digital
    // variants), not merged into one line or silently dropped.
    await expect(cartList.getByRole("listitem")).toHaveCount(2);
    await expect(page.locator("body")).toContainText("$24.99");
    await expect(page.locator("body")).toContainText("$15.99");
    // Total is the sum of both lines ($40.98), not just one of them.
    await expect(page.locator("body")).toContainText("$40.98");

    // Logged-in user with digital in the cart: no guest-email field, no
    // "requires an account" gate (already authenticated via storageState).
    await expect(page.locator("body")).not.toContainText("requires an account");
    await expect(page.getByLabel(/Email \(for order confirmation\)/)).toHaveCount(0);

    // Country is required before the button is enabled.
    const submit = page.getByRole("button", { name: /Proceed to payment/i });
    await expect(submit).toBeDisabled();
    await page.getByLabel(/Country/).selectOption("US");
    await expect(submit).toBeEnabled();

    // Clicking submits to the real Stripe test-mode API and redirects to
    // checkout.stripe.com -- stop here, do NOT enter card details or
    // complete a real payment. Full payment -> webhook -> entitlement is a
    // manual/staging-only step (see qa/checklists/03-checkout-and-payments.md).
    await submit.click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15_000 });
  });
});

test.describe("Checkout — guest with a printed book", () => {
  // A printed book includes its digital edition (2026-11-11), so every order
  // now needs an account: no guest-email checkout any more.
  test("asks them to sign up or log in first, and explains why", async ({ page }) => {
    await page.goto("/store/qa-physical-amazon-and-stripe");
    await page.getByRole("button", { name: /Buy Now/i }).click();

    await page.goto("/checkout");
    await expect(page.locator("body")).toContainText("comes with its digital edition");
    await expect(page.getByRole("link", { name: "Sign up to continue" })).toHaveAttribute("href", "/signup?next=/checkout");
    await expect(page.getByLabel(/Email \(for order confirmation\)/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Proceed to payment/i })).toHaveCount(0);
  });
});

test.describe("Checkout API — server-side guards a client can't be trusted to respect", () => {
  test("rejects a direct request for a sellOnStripe:false (Amazon-only) product", async ({ request }) => {
    const amazonOnlyId = await productIdBySlug("qa-physical-amazon-only");
    const res = await postCheckout(request, {
      items: [{ productId: amazonOnlyId, quantity: 1 }],
      guestEmail: "qa-guest@soul-dust-revival.test",
      country: "US",
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("invalid_product");
  });

  test("rejects a printed-only cart with no session, even with a guest email", async ({ request }) => {
    const physicalId = await productIdBySlug("qa-physical-amazon-and-stripe");
    const res = await postCheckout(request, {
      items: [{ productId: physicalId, quantity: 1 }],
      guestEmail: "qa-guest@soul-dust-revival.test",
      country: "US",
    });
    expect(res.status()).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("login_required");
  });

  test("rejects digital content with no session and no guest email fallback", async ({ request }) => {
    const digitalId = await productIdBySlug("qa-digital-study-not-started");
    const res = await postCheckout(request, {
      items: [{ productId: digitalId, quantity: 1 }],
      country: "US",
    });
    expect(res.status()).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("login_required");
  });

  test("rejects the inactive product even with a well-formed request", async ({ request }) => {
    const inactiveId = await productIdBySlug("qa-inactive-product");
    const res = await postCheckout(request, {
      items: [{ productId: inactiveId, quantity: 1 }],
      guestEmail: "qa-guest@soul-dust-revival.test",
      country: "US",
    });
    expect(res.status()).toBe(400);
  });

});

test.describe("Checkout API — line-item merging (regression per CLAUDE.md 2026-11-07)", () => {
  test.use({ storageState: "qa/.auth/user.json" });

  test("two request lines for the same {productId, variant} create one order_items row with the summed quantity, not two", async ({ request }) => {
    const bundleId = await productIdBySlug("qa-bundle-both-formats");
    const res = await postCheckout(request, {
      items: [
        { productId: bundleId, variant: "digital", quantity: 1 },
        { productId: bundleId, variant: "digital", quantity: 1 },
      ],
      country: "US",
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { url?: string };
    expect(body.url).toMatch(/checkout\.stripe\.com/);
    const sessionIdMatch = body.url!.match(/\/pay\/([^#?]+)/);
    expect(sessionIdMatch).not.toBeNull();

    const connectionString = process.env.TEST_DATABASE_URL!;
    const client = new Client({ connectionString });
    await client.connect();
    try {
      // Stripe checkout session ids embed a '#' fragment, so match on the
      // id prefix actually captured in the URL path segment above.
      const orderRes = await client.query<{ id: string; total_cents: number }>(
        `SELECT id, total_cents FROM orders WHERE stripe_checkout_id LIKE $1 ORDER BY created_at DESC LIMIT 1`,
        [`${sessionIdMatch![1]!.split("#")[0]}%`]
      );
      expect(orderRes.rows.length).toBe(1);
      const order = orderRes.rows[0]!;
      // digitalPriceCents for the bundle is 1599; two qty-1 requests merged
      // into one qty-2 line should total 3198, not be silently dropped or
      // double-counted some other way.
      expect(order.total_cents).toBe(1599 * 2);

      const itemsRes = await client.query<{ quantity: number }>(
        `SELECT quantity FROM order_items WHERE order_id = $1`,
        [order.id]
      );
      expect(itemsRes.rows).toHaveLength(1);
      expect(itemsRes.rows[0]!.quantity).toBe(2);
    } finally {
      await client.end();
    }
  });

  // FIXED (qa/findings/FINDINGS_2026-11-07.md #4): the success page used to
  // dedupe by productId (losing one of a "both" order's two real lines) and
  // always price by the physical priceCents even for the digital line.
  // Fixture: qa/scripts/seed-qa.ts's BOTH_FORMAT_ORDER_ID, a real paid order
  // with 2 order_items on the same product -- 2x physical, 3x digital.
  test("success page shows two distinct, correctly-priced lines for a 'both'-format order", async ({ page }) => {
    await page.goto("/checkout/success?orderId=00000000-0000-4000-8000-000000000001");

    await expect(page.getByText("QA Bundle — Both Formats (physical)")).toBeVisible();
    await expect(page.getByText("QA Bundle — Both Formats (digital)")).toBeVisible();
    // 2 * $24.99 physical, 3 * $15.99 digital -- two different unit prices,
    // not the same physical price applied to both lines.
    await expect(page.getByText("$49.98")).toBeVisible();
    await expect(page.getByText("$47.97")).toBeVisible();
    await expect(page.getByText("$97.95")).toBeVisible(); // order.totalCents, unaffected either way
  });
});
