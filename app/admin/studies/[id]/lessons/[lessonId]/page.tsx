import { getDb } from "@/lib/db/client";
import { lessons, contentBlocks, studies } from "@/lib/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { appUrl } from "@/lib/domains";
import { LessonHeader } from "@/components/admin/builder/LessonHeader";
import { LessonEditorBody } from "@/components/admin/builder/LessonEditorBody";

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
          initialIsSample={lesson.isSample}
          previewHref={appUrl(`/studies/${study.slug}/${lesson.id}`)}
        />
      </div>

      <LessonEditorBody
        lessonId={lesson.id}
        isStudyKind={isStudyKind}
        studyKind={study.kind}
        initialStudyContent={lesson.studyContent}
        initialBlocks={blocks}
        r2PublicBaseUrl={process.env.R2_PUBLIC_BASE_URL}
      />
    </div>
  );
}
