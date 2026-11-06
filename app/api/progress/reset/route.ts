import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { lessons, lessonProgress, studies } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { progressResetSchema } from "@/lib/validation/schemas";
import { hasEntitlement } from "@/lib/entitlements/check";

/**
 * "Start over" on a completed study/devotional from My Library: clears this
 * user's lesson-progress rows for every lesson in the study, so it shows as
 * not-started again. Deliberately leaves `responses` (a Study's saved
 * answers) untouched -- a past reflection is worth keeping even when
 * re-reading the plan from the top, and nothing here asked for it to be erased.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = progressResetSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { studyId } = parsed.data;
  const db = await getDb();

  const study = await db.query.studies.findFirst({ where: eq(studies.id, studyId) });
  if (!study) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await hasEntitlement(session.userId, study.productId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const studyLessons = await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.studyId, studyId));
  const lessonIds = studyLessons.map((l) => l.id);

  if (lessonIds.length > 0) {
    await db
      .delete(lessonProgress)
      .where(and(eq(lessonProgress.userId, session.userId), inArray(lessonProgress.lessonId, lessonIds)));
  }

  return NextResponse.json({ ok: true });
}
