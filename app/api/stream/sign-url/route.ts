import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { contentBlocks, lessons, studies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getLessonAccess } from "@/lib/entitlements/check";
import { generateSignedStreamUrl } from "@/lib/stream/signing";
import { streamSignUrlSchema } from "@/lib/validation/schemas";
import { weekHasStreamMedia } from "@/lib/study/weekMedia";

/**
 * Signs a short-lived playback URL for an uploaded (Cloudflare Stream) video
 * or audio file -- either a content block's own, or one placed inside a Study
 * week's structured content. Access follows the reader exactly: the viewer
 * must be able to read the study, and drafts are for admins only.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = streamSignUrlSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const db = await getDb();

  let lessonId: string;
  let mediaId: string;
  if ("contentBlockId" in parsed.data) {
    const block = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, parsed.data.contentBlockId) });
    if (!block?.mediaId) return NextResponse.json({ error: "Not found" }, { status: 404 });
    lessonId = block.lessonId;
    mediaId = block.mediaId;
  } else {
    lessonId = parsed.data.lessonId;
    mediaId = parsed.data.mediaId;
  }

  const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId) });
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // A week's media id must actually be in that week -- otherwise any Stream
  // id could be signed by naming a lesson the viewer can read.
  if (!("contentBlockId" in parsed.data) && !weekHasStreamMedia(lesson.studyContent, mediaId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const study = await db.query.studies.findFirst({ where: eq(studies.id, lesson.studyId) });
  if (!study) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Both request shapes resolve to one lesson, so one lesson-level check
  // covers both -- a free-sample reader can sign media only in a sample lesson.
  const access = await getLessonAccess(session, study, lesson);
  if (!access.allowed || ((!lesson.published || !study.published) && !access.isAdminPreview)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ url: generateSignedStreamUrl(mediaId) });
}
