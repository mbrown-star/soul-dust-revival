import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { lessonProgress } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { progressSchema } from "@/lib/validation/schemas";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = progressSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { lessonId, status } = parsed.data;

  const existing = await db.query.lessonProgress.findFirst({
    where: and(
      eq(lessonProgress.userId, session.userId),
      eq(lessonProgress.lessonId, lessonId)
    ),
  });

  const completedAt = status === "completed" ? new Date() : null;

  if (existing) {
    await db
      .update(lessonProgress)
      .set({ status, completedAt })
      .where(eq(lessonProgress.id, existing.id));
  } else {
    await db.insert(lessonProgress).values({
      userId: session.userId,
      lessonId,
      status,
      completedAt,
    });
  }

  return NextResponse.json({ ok: true });
}
