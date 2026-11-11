import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { journeyEnrollments, journeys } from "@/lib/db/schema";
import { journeyBeginSchema, journeyWeekdaySchema } from "@/lib/validation/schemas";
import { getJourneyAccess } from "@/lib/entitlements/check";
import { beginRhythm, changeWeekday, isValidTimeZone, todayIn } from "@/lib/journey/schedule";
import { journeyHref, rhythmOf } from "@/lib/journey/load";

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

async function findOwnedJourney(journeyId: string, session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  const db = await getDb();
  const journey = await db.query.journeys.findFirst({ where: eq(journeys.id, journeyId) });
  if (!journey) return { db, journey: null, allowed: false };
  const access = await getJourneyAccess(session, journey);
  // A draft Journey is only for an admin previewing it.
  const allowed = access.allowed && (journey.published || access.isAdminPreview);
  return { db, journey, allowed };
}

function revalidateJourney(journey: { slug: string }) {
  revalidatePath(journeyHref(journey));
  revalidatePath("/library");
}

/** Begin a Journey: picks the reader's Journey day; stop 1 opens today. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = journeyBeginSchema.safeParse(await readJson(req));
  if (!parsed.success || !isValidTimeZone(parsed.data.timeZone)) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.success ? undefined : parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { journeyId, weekday, timeZone } = parsed.data;

  const { db, journey, allowed } = await findOwnedJourney(journeyId, session);
  if (!journey || !allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rhythm = beginRhythm(weekday, todayIn(timeZone));
  const inserted = await db
    .insert(journeyEnrollments)
    .values({ userId: session.userId, journeyId, timeZone, ...rhythm })
    .onConflictDoNothing({ target: [journeyEnrollments.userId, journeyEnrollments.journeyId] })
    .returning({ id: journeyEnrollments.id });
  if (inserted.length === 0) {
    return NextResponse.json({ error: "already_begun", message: "You've already begun this Journey." }, { status: 409 });
  }

  revalidateJourney(journey);
  return NextResponse.json({ ok: true });
}

/** Change the Journey day. Open stops stay open; none opens early. */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = journeyWeekdaySchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { journeyId, weekday } = parsed.data;

  const { db, journey, allowed } = await findOwnedJourney(journeyId, session);
  if (!journey || !allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const where = and(eq(journeyEnrollments.userId, session.userId), eq(journeyEnrollments.journeyId, journeyId));
  const updated = await db.transaction(async (tx) => {
    // Locked so two quick changes can't each re-anchor from the same old rhythm.
    const [enrollment] = await tx.select().from(journeyEnrollments).where(where).for("update");
    if (!enrollment) return null;
    const rhythm = changeWeekday(rhythmOf(enrollment), weekday, todayIn(enrollment.timeZone));
    await tx.update(journeyEnrollments).set({ ...rhythm, updatedAt: new Date() }).where(where);
    return rhythm;
  });
  if (!updated) return NextResponse.json({ error: "not_begun" }, { status: 404 });

  revalidateJourney(journey);
  return NextResponse.json({ ok: true, nextOpensOn: updated.nextOpensOn });
}
