import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin/guard";
import { getDb } from "@/lib/db/client";
import { journeyEnrollments, journeys, products } from "@/lib/db/schema";
import { adminJourneyCreateSchema, adminJourneyDeleteSchema, adminJourneyUpdateSchema } from "@/lib/validation/schemas";
import { journeyHref } from "@/lib/journey/load";

// Presenting a bundle as a Journey (see journeys in lib/db/schema.ts). The
// Parts are the bundle's own components, so there's nothing else to edit
// here: create it (unpublished), publish or unpublish, or remove it before
// anyone has begun.

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function revalidateReader(journey: { slug: string }) {
  revalidatePath(journeyHref(journey));
  revalidatePath("/library");
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = adminJourneyCreateSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { bundleProductId, title, slug } = parsed.data;
  const db = await getDb();

  const bundle = await db.query.products.findFirst({ where: eq(products.id, bundleProductId) });
  if (!bundle || bundle.type !== "bundle") {
    return NextResponse.json({ error: "not_a_bundle", message: "Only a bundle can be presented as a Journey." }, { status: 400 });
  }

  const [journey] = await db
    .insert(journeys)
    .values({ bundleProductId, title, slug })
    .onConflictDoNothing()
    .returning();
  if (!journey) {
    return NextResponse.json(
      { error: "conflict", message: "This bundle is already a Journey, or that slug is taken." },
      { status: 409 }
    );
  }
  return NextResponse.json({ id: journey.id });
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = adminJourneyUpdateSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const db = await getDb();
  const [journey] = await db
    .update(journeys)
    .set({ published: parsed.data.published })
    .where(eq(journeys.id, parsed.data.id))
    .returning();
  if (!journey) return NextResponse.json({ error: "Not found" }, { status: 404 });

  revalidateReader(journey);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = adminJourneyDeleteSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const db = await getDb();
  const journey = await db.query.journeys.findFirst({ where: eq(journeys.id, parsed.data.id) });
  if (!journey) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Someone's place in the Journey is real history, like an order.
  const [begun] = await db
    .select({ id: journeyEnrollments.id })
    .from(journeyEnrollments)
    .where(eq(journeyEnrollments.journeyId, journey.id))
    .limit(1);
  if (begun) {
    return NextResponse.json(
      { error: "has_readers", message: "Readers have begun this Journey. Unpublish it instead." },
      { status: 409 }
    );
  }

  await db.delete(journeys).where(eq(journeys.id, journey.id));
  revalidateReader(journey);
  return NextResponse.json({ ok: true });
}
