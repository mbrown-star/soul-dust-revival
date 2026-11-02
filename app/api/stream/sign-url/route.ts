import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { contentBlocks, lessons, studies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hasEntitlement } from "@/lib/entitlements/check";
import { generateSignedStreamUrl } from "@/lib/stream/signing";
import { z } from "zod";

const schema = z.object({ contentBlockId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { contentBlockId } = parsed.data;

  const block = await db.query.contentBlocks.findFirst({
    where: eq(contentBlocks.id, contentBlockId),
  });
  if (!block || !block.mediaId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, block.lessonId) });
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const study = await db.query.studies.findFirst({ where: eq(studies.id, lesson.studyId) });
  if (!study) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await hasEntitlement(session.userId, study.productId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = generateSignedStreamUrl(block.mediaId);
  return NextResponse.json({ url });
}
