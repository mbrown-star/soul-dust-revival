import { getDb } from "@/lib/db/client";
import { lessons, contentBlocks, studies } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { LessonBlockEditor } from "@/components/admin/LessonBlockEditor";
import { StudyContentEditorGate } from "@/components/admin/StudyContentEditorGate";
import Link from "next/link";

export default async function LessonEditorPage({
  params,
}: {
  params: Promise<{ id: string; lessonId: string }>;
}) {
  const { id, lessonId } = await params;
  const db = await getDb();
  const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId) });
  if (!lesson) redirect(`/admin/studies/${id}`);

  const study = await db.query.studies.findFirst({ where: eq(studies.id, id) });

  const blocks = await db
    .select()
    .from(contentBlocks)
    .where(eq(contentBlocks.lessonId, lesson.id))
    .orderBy(asc(contentBlocks.orderIndex));

  // A Study-kind lesson with real studyContent manages its own "question"
  // content_blocks (the per-station answer plumbing) exclusively through
  // StudyContentEditor now -- excluded here so the same row can't be edited
  // through two different surfaces and drift out of sync. Any OTHER block
  // type (text/image/video/audio/callout) an admin may have separately
  // added to this lesson stays fully visible and editable below -- found
  // during this build's own review that hiding the whole editor would have
  // silently made those permanently unreachable, a real (if currently
  // unreached in practice) capability loss.
  const hasStudyContent = study?.kind === "study" && !!lesson.studyContent;
  const contentBlockEditorBlocks = hasStudyContent ? blocks.filter((b) => b.type !== "question") : blocks;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/studies/${id}`} className="text-sm text-moss">
          ← {study?.title}
        </Link>
        <h1 className="text-xl font-semibold">{lesson.title}</h1>
      </div>

      {/* REAL FIX (qa/findings/FINDINGS_2026-11-07.md #8): a Study-kind
          lesson's structured content (lesson.studyContent -- the subtitle,
          sections/parts, passage, Work the Word stations, prayer,
          benediction, everything the 5-tab Study reader renders) previously
          had no UI path to edit at all. Only Study-kind studies are offered
          the option to create it from scratch if a lesson doesn't have it
          yet -- a devotional-kind study never uses this shape, so the gate
          doesn't apply there. */}
      {study?.kind === "study" && (
        <StudyContentEditorGate lessonId={lesson.id} initialContent={lesson.studyContent} />
      )}

      {/* The plain content-block editor below is hidden once a Study-kind
          lesson has real studyContent: its own content_blocks rows (the
          per-station "question" blocks) are internal plumbing the reader
          saves answers against, not meant for direct editing here -- doing
          so could drift out of sync with the matching station's own
          question text, which the save above always keeps in sync. Still
          shown for a devotional lesson (always) or a Study-kind lesson with
          no studyContent yet (its real, current fallback reading view, per
          app/(study-app)/studies/[slug]/[lessonId]/page.tsx). */}
      {!(study?.kind === "study" && lesson.studyContent) && (
        <LessonBlockEditor lessonId={lesson.id} initialBlocks={blocks} />
      )}
    </div>
  );
}
