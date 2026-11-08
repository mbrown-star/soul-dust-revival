import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { getDb } from "@/lib/db/client";
import { products, studies, orderItems, entitlements } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { productSchema, productDeleteSchema } from "@/lib/validation/schemas";
import { MAX_FEATURED_PRODUCTS, featuredCount } from "@/lib/commerce/featuredLimit";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = productSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
  const db = await getDb();

  if (body.featured && (await featuredCount(db)) >= MAX_FEATURED_PRODUCTS) {
    return NextResponse.json(
      { error: "too_many_featured", message: `Only ${MAX_FEATURED_PRODUCTS} products can be featured at once.` },
      { status: 400 }
    );
  }

  const [product] = await db
    .insert(products)
    .values({
      title: body.title,
      slug: body.slug,
      description: body.description,
      priceCents: body.priceCents,
      digitalPriceCents: body.digitalPriceCents,
      format: body.format,
      type: body.type,
      imageUrl: body.imageUrl,
      imageAlt: body.imageAlt,
      backImageUrl: body.backImageUrl,
      backImageAlt: body.backImageAlt,
      coverPdfUrl: body.coverPdfUrl,
      amazonUrl: body.amazonUrl,
      sellOnStripe: body.sellOnStripe,
      active: body.active,
      featured: body.featured,
    })
    .returning();

  return NextResponse.json(product);
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = productSchema.safeParse(json);
  if (!parsed.success || !parsed.data.id) {
    return NextResponse.json({ error: "invalid_input", details: parsed.success ? "Missing id" : parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
  const db = await getDb();

  // If price or core details change after a Stripe Price already exists,
  // clear the cached Stripe IDs so getOrCreateStripePrice creates a fresh one
  // next checkout — Stripe Prices are immutable once created. Physical and
  // digital prices (and their Stripe IDs) are independent for format "both".
  const existing = await db.query.products.findFirst({ where: eq(products.id, body.id!) });
  const priceChanged = existing && existing.priceCents !== body.priceCents;
  const digitalPriceChanged = existing && existing.digitalPriceCents !== body.digitalPriceCents;

  // Only a transition into "featured" counts toward the limit -- re-saving a
  // product that's already featured isn't a new addition, so it's excluded
  // from its own count.
  if (body.featured && !existing?.featured && (await featuredCount(db, body.id)) >= MAX_FEATURED_PRODUCTS) {
    return NextResponse.json(
      { error: "too_many_featured", message: `Only ${MAX_FEATURED_PRODUCTS} products can be featured at once.` },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(products)
    .set({
      title: body.title,
      slug: body.slug,
      description: body.description,
      priceCents: body.priceCents,
      digitalPriceCents: body.digitalPriceCents,
      format: body.format,
      type: body.type,
      imageUrl: body.imageUrl,
      imageAlt: body.imageAlt,
      backImageUrl: body.backImageUrl,
      backImageAlt: body.backImageAlt,
      coverPdfUrl: body.coverPdfUrl,
      featured: body.featured,
      amazonUrl: body.amazonUrl,
      sellOnStripe: body.sellOnStripe,
      active: body.active,
      ...(priceChanged ? { stripePriceId: null, stripeProductId: null } : {}),
      ...(digitalPriceChanged ? { digitalStripePriceId: null, digitalStripeProductId: null } : {}),
    })
    .where(eq(products.id, body.id!))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = (await req.json()) as Record<string, unknown>;
  const parsed = productDeleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { id } = parsed.data;
  const db = await getDb();

  // A product with purchase or content history is never silently cascaded
  // away — that would destroy order/entitlement records or orphan a study.
  // Deactivating (the existing "Active" checkbox) is the right tool for
  // retiring a product that's already been sold or is linked to content;
  // Delete is only for a product that was never actually used.
  const [linkedStudy] = await db.select({ id: studies.id }).from(studies).where(eq(studies.productId, id)).limit(1);
  if (linkedStudy) {
    return NextResponse.json(
      { error: "has_study", message: "This product is linked to a study. Unlink or delete the study first." },
      { status: 409 }
    );
  }
  const [linkedOrderItem] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.productId, id))
    .limit(1);
  if (linkedOrderItem) {
    return NextResponse.json(
      { error: "has_orders", message: "This product has order history and can't be deleted. Mark it inactive instead." },
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
      { error: "has_entitlements", message: "This product has granted entitlements and can't be deleted. Mark it inactive instead." },
      { status: 409 }
    );
  }

  await db.delete(products).where(eq(products.id, id));

  return NextResponse.json({ ok: true });
}
