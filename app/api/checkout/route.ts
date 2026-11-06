import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { orders, orderItems, products, users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { stripe } from "@/lib/stripe/client";
import { getOrCreateStripePrice } from "@/lib/stripe/products";
import { checkoutSchema } from "@/lib/validation/schemas";

export async function POST(req: NextRequest) {
  const json = await req.json();
  const parsed = checkoutSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { items, guestEmail, country } = parsed.data;
  const db = await getDb();

  const productIds = items.map((i) => i.productId);
  const dbProducts = await db.select().from(products).where(inArray(products.id, productIds));

  if (dbProducts.length !== new Set(productIds).size) {
    return NextResponse.json({ error: "invalid_product" }, { status: 400 });
  }

  // Every requested product must exist and be active, its variant must
  // match its actual format, and its *effective* Stripe route must be
  // sellable — prevents checking out with a stale/removed product ID, a
  // variant that doesn't apply to it, or one an admin has marked
  // Amazon-exclusive (sellOnStripe: false), crafted directly in the request
  // body. A format "both" product's digital variant always sells through
  // Stripe regardless of sellOnStripe, which only ever describes the
  // physical route; its physical variant (and a plain "physical" product)
  // still respects sellOnStripe.
  for (const item of items) {
    const product = dbProducts.find((p) => p.id === item.productId)!;
    if (!product.active) {
      return NextResponse.json({ error: "invalid_product" }, { status: 400 });
    }
    if (product.format === "both") {
      if (!item.variant) {
        return NextResponse.json({ error: "variant_required" }, { status: 400 });
      }
      if (item.variant === "physical" && !product.sellOnStripe) {
        return NextResponse.json({ error: "invalid_product" }, { status: 400 });
      }
    } else {
      if (item.variant) {
        return NextResponse.json({ error: "invalid_product" }, { status: 400 });
      }
      if (!product.sellOnStripe) {
        return NextResponse.json({ error: "invalid_product" }, { status: 400 });
      }
    }
  }

  const isDigitalItem = (item: (typeof items)[number]) => {
    const product = dbProducts.find((p) => p.id === item.productId)!;
    return product.format === "digital" || (product.format === "both" && item.variant === "digital");
  };
  const isPhysicalItem = (item: (typeof items)[number]) => {
    const product = dbProducts.find((p) => p.id === item.productId)!;
    return product.format === "physical" || (product.format === "both" && item.variant === "physical");
  };

  const hasDigital = items.some(isDigitalItem);
  const hasPhysical = items.some(isPhysicalItem);

  const session = await getSession();

  // Rule: any digital/webapp content in the cart requires an account.
  // Physical-only carts may check out as a guest with just an email.
  if (hasDigital && !session) {
    return NextResponse.json(
      { error: "login_required", message: "Please log in to purchase digital content." },
      { status: 401 }
    );
  }

  if (!hasDigital && !session && !guestEmail) {
    return NextResponse.json(
      { error: "guest_email_required", message: "Email is required for guest checkout." },
      { status: 400 }
    );
  }

  // Prices always come from our own DB record, never from client input —
  // the client only ever supplies productId + quantity (+ variant, for a
  // format "both" product, validated against its format above).
  const totalCents = items.reduce((sum, item) => {
    const product = dbProducts.find((p) => p.id === item.productId)!;
    const priceCents = isDigitalItem(item) && product.format === "both" ? product.digitalPriceCents! : product.priceCents;
    return sum + priceCents * item.quantity;
  }, 0);

  // Create the order in a pending state before redirecting to Stripe.
  const [order] = await db
    .insert(orders)
    .values({
      userId: session?.userId ?? null,
      guestEmail: session ? null : guestEmail,
      country,
      status: "pending",
      totalCents,
      requiresShipping: hasPhysical,
    })
    .returning();

  // Insert always returns the inserted row — this guard exists so TypeScript
  // (and anyone reading this) doesn't have to trust that implicitly, and so
  // a genuinely unexpected empty result fails loudly here rather than
  // producing a confusing crash a few lines down.
  if (!order) {
    return NextResponse.json({ error: "order_creation_failed" }, { status: 500 });
  }

  // Backfill the user's profile-level country if they don't have one yet —
  // this is what lets the country be known outside the context of any one
  // order (e.g. for account-level data-protection handling), without asking
  // for it again at every future purchase.
  if (session) {
    const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
    if (user && !user.country) {
      await db.update(users).set({ country }).where(eq(users.id, session.userId));
    }
  }

  await db.insert(orderItems).values(
    items.map((item) => ({
      orderId: order.id,
      productId: item.productId,
      quantity: item.quantity,
      variant: item.variant ?? null,
    }))
  );

  // Build Stripe line items, creating Stripe Products/Prices on first use.
  const lineItems = await Promise.all(
    items.map(async (item) => ({
      price: await getOrCreateStripePrice(item.productId, item.variant),
      quantity: item.quantity,
    }))
  );

  const origin = req.nextUrl.origin;

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    customer_email: session?.email ?? guestEmail,
    allow_promotion_codes: true,
    shipping_address_collection: hasPhysical ? { allowed_countries: ["US", "CA"] } : undefined,
    success_url: `${origin}/checkout/success?orderId=${order.id}`,
    cancel_url: `${origin}/checkout`,
    metadata: { orderId: order.id, country },
  });

  await db
    .update(orders)
    .set({ stripeCheckoutId: checkoutSession.id })
    .where(eq(orders.id, order.id));

  return NextResponse.json({ url: checkoutSession.url });
}
