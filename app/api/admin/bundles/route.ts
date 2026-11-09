import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { getDb } from "@/lib/db/client";
import { products, bundleItems, orderItems, entitlements } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { bundleSchema, bundleDeleteSchema } from "@/lib/validation/schemas";
import { MAX_FEATURED_PRODUCTS, featuredCount } from "@/lib/commerce/featuredLimit";
import { stripePriceInvalidationFields } from "@/lib/stripe/products";

// A bundle is a `products` row (type: "bundle") plus a bundle_items
// membership list -- see lib/db/schema.ts's comment on bundleItems. This
// route owns both halves together: every POST/PATCH replaces the full
// membership list wholesale (delete-then-reinsert inside one transaction)
// rather than diffing adds/removes/reorders -- simplest correct way to
// handle "the admin changed which parts are in this bundle" in one save,
// and the admin UI always sends the complete current list anyway.
async function validateComponents(
  db: Awaited<ReturnType<typeof getDb>>,
  componentProductIds: string[]
): Promise<string | null> {
  const unique = new Set(componentProductIds);
  if (unique.size !== componentProductIds.length) return "A product can't be listed twice in the same bundle.";

  const rows = await db
    .select({ id: products.id, type: products.type })
    .from(products)
    .where(inArray(products.id, componentProductIds));

  if (rows.length !== unique.size) return "One or more selected products don't exist.";
  if (rows.some((r) => r.type === "bundle")) return "A bundle can't contain another bundle.";
  return null;
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = bundleSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
  const db = await getDb();

  const componentError = await validateComponents(db, body.componentProductIds);
  if (componentError) {
    return NextResponse.json({ error: "invalid_components", message: componentError }, { status: 400 });
  }

  if (body.featured && (await featuredCount(db)) >= MAX_FEATURED_PRODUCTS) {
    return NextResponse.json(
      { error: "too_many_featured", message: `Only ${MAX_FEATURED_PRODUCTS} products can be featured at once.` },
      { status: 400 }
    );
  }

  const bundle = await db.transaction(async (tx) => {
    const [product] = await tx
      .insert(products)
      .values({
        type: "bundle",
        format: body.format,
        title: body.title,
        slug: body.slug,
        description: body.description,
        priceCents: body.priceCents,
        digitalPriceCents: body.digitalPriceCents,
        imageUrl: body.imageUrl,
        imageAlt: body.imageAlt,
        active: body.active,
        featured: body.featured,
        // A bundle is always Stripe-only (never Amazon), for either purchase
        // route of a "both" bundle included -- there's no custom-fulfillment
        // path through a third-party marketplace, and the founder-ship-
        // notification email only fires off our own webhook.
        sellOnStripe: true,
        amazonUrl: null,
      })
      .returning();
    if (!product) throw new Error("Bundle creation failed");

    await tx.insert(bundleItems).values(
      body.componentProductIds.map((componentProductId, index) => ({
        bundleProductId: product.id,
        componentProductId,
        orderIndex: index,
      }))
    );

    return product;
  });

  return NextResponse.json(bundle);
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = bundleSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { id, ...body } = parsed.data;
  if (!id) {
    return NextResponse.json({ error: "invalid_input", details: "Missing id" }, { status: 400 });
  }
  const db = await getDb();

  const existing = await db.query.products.findFirst({ where: eq(products.id, id) });
  if (!existing || existing.type !== "bundle") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const componentError = await validateComponents(db, body.componentProductIds);
  if (componentError) {
    return NextResponse.json({ error: "invalid_components", message: componentError }, { status: 400 });
  }

  // Only a transition into "featured" counts toward the limit -- re-saving a
  // bundle that's already featured isn't a new addition. Same rule as the
  // regular products route.
  if (body.featured && !existing.featured && (await featuredCount(db, id)) >= MAX_FEATURED_PRODUCTS) {
    return NextResponse.json(
      { error: "too_many_featured", message: `Only ${MAX_FEATURED_PRODUCTS} products can be featured at once.` },
      { status: 400 }
    );
  }

  const bundle = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(products)
      .set({
        format: body.format,
        title: body.title,
        slug: body.slug,
        description: body.description,
        priceCents: body.priceCents,
        digitalPriceCents: body.digitalPriceCents,
        imageUrl: body.imageUrl,
        imageAlt: body.imageAlt,
        active: body.active,
        featured: body.featured,
        // Same invalidation rule as the regular products route -- a price
        // change clears any already-created Stripe Price, since Stripe
        // Prices are immutable once created. Each of a "both" bundle's two
        // independent prices is invalidated independently.
        ...stripePriceInvalidationFields(existing, body),
      })
      .where(eq(products.id, id))
      .returning();

    await tx.delete(bundleItems).where(eq(bundleItems.bundleProductId, id));
    await tx.insert(bundleItems).values(
      body.componentProductIds.map((componentProductId, index) => ({
        bundleProductId: id,
        componentProductId,
        orderIndex: index,
      }))
    );

    return updated;
  });

  return NextResponse.json(bundle);
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = (await req.json()) as Record<string, unknown>;
  const parsed = bundleDeleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { id } = parsed.data;
  const db = await getDb();

  // Same safety check every other delete route in this admin applies: a
  // bundle with real purchase/entitlement history is never silently
  // cascaded away. Deactivating (the existing "Active" checkbox) is the
  // right tool once it's actually been sold.
  const [linkedOrderItem] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.productId, id))
    .limit(1);
  if (linkedOrderItem) {
    return NextResponse.json(
      { error: "has_orders", message: "This bundle has order history and can't be deleted. Mark it inactive instead." },
      { status: 409 }
    );
  }
  const [linkedEntitlement] = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(eq(entitlements.productId, id))
    .limit(1);
  if (linkedEntitlement) {
    return NextResponse.json(
      { error: "has_entitlements", message: "This bundle has granted entitlements and can't be deleted. Mark it inactive instead." },
      { status: 409 }
    );
  }

  await db.transaction(async (tx) => {
    await tx.delete(bundleItems).where(eq(bundleItems.bundleProductId, id));
    await tx.delete(products).where(eq(products.id, id));
  });

  return NextResponse.json({ ok: true });
}
