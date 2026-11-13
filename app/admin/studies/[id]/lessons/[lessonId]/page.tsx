import { getDb } from "@/lib/db/client";
import { lessons, studies } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { workingBlockRows } from "@/lib/lessons/publishedContent";
import { redirect } from "next/navigation";
import Link from "next/link";
import { appUrl } from "@/lib/domains";
import { LessonHeader } from "@/components/admin/builder/LessonHeader";
import { LessonEditorBody } from "@/components/admin/builder/LessonEditorBody";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lessonId: string }> }): Promise<Metadata> {
  const { lessonId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(lessonId)) return { title: "Edit lesson" };
  const db = await getDb();
  const [row] = await db.select({ title: lessons.title }).from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  return { title: row ? `Edit: ${row.title}` : "Edit lesson" };
}

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

  // The working copy: what the admin edits (a published lesson's readers see
  // its published snapshot until changes are published).
  const blocks = await workingBlockRows(db, lesson.id);

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
          initialHasDraftChanges={lesson.hasDraftChanges}
          previewHref={appUrl(`/studies/${study.slug}/${lesson.id}`)}
        />
      </div>

      <LessonEditorBody
        lessonId={lesson.id}
        lessonTitle={lesson.title}
        isStudyKind={isStudyKind}
        studyKind={study.kind}
        initialStudyContent={lesson.studyContent}
        initialBlocks={blocks}
        r2PublicBaseUrl={process.env.R2_PUBLIC_BASE_URL}
      />
    </div>
  );
}
