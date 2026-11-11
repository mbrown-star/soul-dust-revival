import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { responses, contentBlocks, lessons, studies } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { responseSchema } from "@/lib/validation/schemas";
import { getLessonAccess } from "@/lib/entitlements/check";
import { snapshotBlockIds } from "@/lib/lessons/publishedContent";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { contentBlockId, answerText } = parsed.data;
  const db = await getDb();

  // Verify the block belongs to a study this user actually has access to —
  // without this, any authenticated user could write responses against any
  // content block ID, including ones from studies they never purchased.
  const block = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, contentBlockId) });
  if (!block) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, block.lessonId) });
  const study = lesson ? await db.query.studies.findFirst({ where: eq(studies.id, lesson.studyId) }) : null;
  const access = lesson && study ? await getLessonAccess(session, study, lesson) : null;
  if (!lesson || !access?.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // A published lesson shows readers its published snapshot; a question that
  // exists only in unpublished changes isn't theirs to answer (an admin
  // previewing the draft may).
  if (lesson.publishedContent && !access.isAdminPreview && !snapshotBlockIds(lesson.publishedContent).has(contentBlockId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await db.query.responses.findFirst({
    where: and(
      eq(responses.userId, session.userId),
      eq(responses.contentBlockId, contentBlockId)
    ),
  });

  if (existing) {
    await db
      .update(responses)
      .set({ answerText, updatedAt: new Date() })
      .where(eq(responses.id, existing.id));
  } else {
    await db.insert(responses).values({
      userId: session.userId,
      contentBlockId,
      answerText,
    });
  }

  return NextResponse.json({ ok: true });
}
