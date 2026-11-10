import { getDb } from "@/lib/db/client";
import { lessons, contentBlocks, studies } from "@/lib/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { appUrl } from "@/lib/domains";
import { LessonHeader } from "@/components/admin/builder/LessonHeader";
import { LessonBuilder } from "@/components/admin/builder/LessonBuilder";
import { StudyWeekGate } from "@/components/admin/builder/study/StudyWeekGate";

export const dynamic = "force-dynamic";

export default async function LessonEditorPage({
  params,
}: {
  params: Promise<{ id: string; lessonId: string }>;
}) {
  const { id, lessonId } = await params;
  const db = await getDb();
  const study = await db.query.studies.findFirst({ where: eq(studies.id, id) });
  if (!study) redirect("/admin/studies");
  const lesson = await db.query.lessons.findFirst({ where: and(eq(lessons.id, lessonId), eq(lessons.studyId, study.id)) });
  if (!lesson) redirect(`/admin/studies/${id}`);

  const blocks = await db
    .select()
    .from(contentBlocks)
    .where(eq(contentBlocks.lessonId, lesson.id))
    .orderBy(asc(contentBlocks.orderIndex));

  const isStudyKind = study.kind === "study";
  // Once a Study lesson has a structured week, its only content_blocks rows
  // are the stations' answer plumbing, owned by the week builder -- the
  // free-form block canvas would just be a second, out-of-sync way to edit
  // them, so it's hidden.
  const usesWeekBuilder = isStudyKind && !!lesson.studyContent;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link href={`/admin/studies/${id}`} className="text-sm text-moss hover:text-ink">
          ← {study.title}
        </Link>
        <LessonHeader
          lessonId={lesson.id}
          initialTitle={lesson.title}
          initialPublished={lesson.published}
          previewHref={appUrl(`/studies/${study.slug}/${lesson.id}`)}
        />
      </div>

      {isStudyKind && <StudyWeekGate lessonId={lesson.id} initialContent={lesson.studyContent} />}

      {!usesWeekBuilder && (
        <LessonBuilder
          lessonId={lesson.id}
          initialBlocks={blocks}
          studyKind={study.kind}
          r2PublicBaseUrl={process.env.R2_PUBLIC_BASE_URL}
        />
      )}
    </div>
  );
}
