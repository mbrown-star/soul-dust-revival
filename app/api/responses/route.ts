import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { responses, contentBlocks, lessons, studies } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { responseSchema } from "@/lib/validation/schemas";
import { hasEntitlement } from "@/lib/entitlements/check";

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
  if (!study || !(await hasEntitlement(session.userId, study.productId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
