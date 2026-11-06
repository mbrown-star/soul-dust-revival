import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { lessonProgress, lessons, studies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { progressSchema } from "@/lib/validation/schemas";
import { hasEntitlement } from "@/lib/entitlements/check";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = progressSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { lessonId, status } = parsed.data;
  const db = await getDb();

  // Verify the lesson belongs to a study this user actually has access to —
  // without this, any authenticated user could write progress against any
  // lesson ID, including ones from studies they never purchased (mirrors
  // the same check in /api/responses and /api/stream/sign-url).
  const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId) });
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const study = await db.query.studies.findFirst({ where: eq(studies.id, lesson.studyId) });
  if (!study || !(await hasEntitlement(session.userId, study.productId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const completedAt = status === "completed" ? new Date() : null;

  // A single atomic upsert, not a separate select-then-insert-or-update --
  // two near-simultaneous writes for the same user+lesson (the "mark in
  // progress" ping on page load racing the "mark complete" button) could
  // both see no existing row under the old check-then-act version and both
  // insert, leaving two rows whose read order is arbitrary. The database's
  // own unique constraint (user_id, lesson_id) makes this one statement
  // race-proof regardless of request timing.
  await db
    .insert(lessonProgress)
    .values({ userId: session.userId, lessonId, status, completedAt })
    .onConflictDoUpdate({
      target: [lessonProgress.userId, lessonProgress.lessonId],
      set: { status, completedAt },
    });

  // The write itself was correct even before this -- what was stale was the
  // study's lesson list and My Library, both server-rendered and cached by
  // Next's router cache. Navigating back to either after marking a lesson
  // complete could show the pre-mutation snapshot even though the database
  // already had the right value. Explicitly invalidating both here is the
  // documented fix for "a mutation in a Route Handler needs to bust a cached
  // page elsewhere" rather than relying on client-side refresh timing.
  revalidatePath(`/studies/${study.slug}`);
  revalidatePath("/library");

  return NextResponse.json({ ok: true });
}
