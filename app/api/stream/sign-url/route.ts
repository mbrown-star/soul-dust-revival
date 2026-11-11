import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { contentBlocks, lessons, studies } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import type { StudyWeekContent } from "@/lib/study/studyContent";
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

  // Resolve the request to one lesson first; which media id may be signed
  // depends on what this viewer can see of it (below).
  let lessonId: string;
  let blockId: string | null = null;
  if ("contentBlockId" in parsed.data) {
    const block = await db.query.contentBlocks.findFirst({
      where: eq(contentBlocks.id, parsed.data.contentBlockId),
      columns: { lessonId: true, id: true },
    });
    if (!block) return NextResponse.json({ error: "Not found" }, { status: 404 });
    lessonId = block.lessonId;
    blockId = block.id;
  } else {
    lessonId = parsed.data.lessonId;
  }

  const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId) });
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const study = await db.query.studies.findFirst({ where: eq(studies.id, lesson.studyId) });
  if (!study) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Both request shapes resolve to one lesson, so one lesson-level check
  // covers both -- a free-sample reader can sign media only in a sample lesson.
  const access = await getLessonAccess(session, study, lesson);
  if (!access.allowed || ((!lesson.published || !study.published) && !access.isAdminPreview)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Readers sign what they're shown: a published lesson's snapshot. The
  // working copy (unpublished changes) can be signed only by an admin
  // previewing it.
  type Version = { blocks: { id: string; mediaId: string | null }[]; studyContent: StudyWeekContent | null };
  const versions: Version[] = [];
  if (lesson.publishedContent) versions.push(lesson.publishedContent);
  if (!lesson.publishedContent || access.isAdminPreview) {
    const working = await db
      .select({ id: contentBlocks.id, mediaId: contentBlocks.mediaId })
      .from(contentBlocks)
      .where(and(eq(contentBlocks.lessonId, lesson.id), isNull(contentBlocks.removedAt)));
    const workingVersion: Version = { blocks: working, studyContent: lesson.studyContent };
    // An admin previewing unpublished changes plays the draft's media.
    if (parsed.data.draft && access.isAdminPreview) versions.unshift(workingVersion);
    else versions.push(workingVersion);
  }

  let mediaId: string | null = null;
  if (blockId) {
    for (const version of versions) {
      const found = version.blocks.find((b) => b.id === blockId)?.mediaId;
      if (found) {
        mediaId = found;
        break;
      }
    }
  } else if ("mediaId" in parsed.data) {
    // A week's media id must actually be in that week -- otherwise any
    // Stream id could be signed by naming a lesson the viewer can read.
    const requested = parsed.data.mediaId;
    if (versions.some((v) => weekHasStreamMedia(v.studyContent, requested))) mediaId = requested;
  }
  if (!mediaId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ url: generateSignedStreamUrl(mediaId) });
}
