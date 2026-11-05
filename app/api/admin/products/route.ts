import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { productSchema } from "@/lib/validation/schemas";

// Shown in the homepage's "Featured content" section, which has room for up
// to this many tiles. "No more than N featured" is a cross-row count, so it
// can't be expressed in productSchema's per-row Zod validation -- checked
// here instead, against the current DB state.
const MAX_FEATURED_PRODUCTS = 8;

async function featuredCount(excludeProductId?: string): Promise<number> {
  const featured = await db.query.products.findMany({
    where: eq(products.featured, true),
    columns: { id: true },
  });
  return excludeProductId ? featured.filter((p) => p.id !== excludeProductId).length : featured.length;
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = productSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  if (body.featured && (await featuredCount()) >= MAX_FEATURED_PRODUCTS) {
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

  // If price or core details change after a Stripe Price already exists,
  // clear the cached Stripe IDs so getOrCreateStripePrice creates a fresh one
  // next checkout — Stripe Prices are immutable once created.
  const existing = await db.query.products.findFirst({ where: eq(products.id, body.id!) });
  const priceChanged = existing && existing.priceCents !== body.priceCents;

  // Only a transition into "featured" counts toward the limit -- re-saving a
  // product that's already featured isn't a new addition, so it's excluded
  // from its own count.
  if (body.featured && !existing?.featured && (await featuredCount(body.id)) >= MAX_FEATURED_PRODUCTS) {
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
    })
    .where(eq(products.id, body.id!))
    .returning();

  return NextResponse.json(updated);
}
