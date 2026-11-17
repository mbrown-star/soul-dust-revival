import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { lessonProgress, lessons, studies } from "@/lib/db/schema";
import { weekPartProgressSchema } from "@/lib/validation/schemas";
import { getLessonAccess } from "@/lib/entitlements/check";
import { cleanStoredParts } from "@/lib/study/weekParts";

/**
 * Marks one part of a tabbed Study week finished or not, on the reader's
 * account (lesson_progress.parts_done), so the week tracker is the same on
 * every device. Lift Up isn't a part here: it's the week's completion, set
 * through /api/progress.
 *
 * Each write is one statement that adds or removes just this part, so two
 * parts saved at once (two tabs, two devices) can't overwrite each other.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const parsed = weekPartProgressSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { lessonId, part, done } = parsed.data;
  const db = await getDb();

  // Same check as /api/progress: only a lesson this reader may open.
  const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId) });
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const study = await db.query.studies.findFirst({ where: eq(studies.id, lesson.studyId) });
  if (!study || !(await getLessonAccess(session, study, lesson)).allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let partsDone: string[];
  if (done) {
    // Starting any part starts the week (My Library's "Continue").
    const [row] = await db
      .insert(lessonProgress)
      .values({ userId: session.userId, lessonId, status: "in_progress", partsDone: [part] })
      .onConflictDoUpdate({
        target: [lessonProgress.userId, lessonProgress.lessonId],
        set: {
          partsDone: sql`CASE WHEN ${part}::text = ANY(${lessonProgress.partsDone}) THEN ${lessonProgress.partsDone} ELSE array_append(${lessonProgress.partsDone}, ${part}::text) END`,
          status: sql`CASE WHEN ${lessonProgress.status} = 'not_started' THEN 'in_progress' ELSE ${lessonProgress.status} END`,
        },
      })
      .returning({ partsDone: lessonProgress.partsDone });
    partsDone = row?.partsDone ?? [part];
  } else {
    // Un-finishing a part never creates a row or changes the week's status.
    const [row] = await db
      .update(lessonProgress)
      .set({ partsDone: sql`array_remove(${lessonProgress.partsDone}, ${part}::text)` })
      .where(and(eq(lessonProgress.userId, session.userId), eq(lessonProgress.lessonId, lessonId)))
      .returning({ partsDone: lessonProgress.partsDone });
    partsDone = row?.partsDone ?? [];
  }

  // See /api/progress: the study list and My Library are cached pages.
  revalidatePath(`/studies/${study.slug}`);
  revalidatePath("/library");

  return NextResponse.json({ ok: true, partsDone: cleanStoredParts(partsDone) });
}
