import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { productSchema } from "@/lib/validation/schemas";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = productSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

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
      amazonUrl: body.amazonUrl,
      sellOnStripe: body.sellOnStripe,
      active: body.active,
      ...(priceChanged ? { stripePriceId: null, stripeProductId: null } : {}),
    })
    .where(eq(products.id, body.id!))
    .returning();

  return NextResponse.json(updated);
}
