import { db } from "@/lib/db/client";
import { lessons, contentBlocks, studies } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { LessonBlockEditor } from "@/components/admin/LessonBlockEditor";
import Link from "next/link";

export default async function LessonEditorPage({
  params,
}: {
  params: Promise<{ id: string; lessonId: string }>;
}) {
  const { id, lessonId } = await params;
  const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId) });
  if (!lesson) redirect(`/admin/studies/${id}`);

  const study = await db.query.studies.findFirst({ where: eq(studies.id, id) });

  const blocks = await db
    .select()
    .from(contentBlocks)
    .where(eq(contentBlocks.lessonId, lesson.id))
    .orderBy(asc(contentBlocks.orderIndex));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/studies/${id}`} className="text-sm text-neutral-400">
          ← {study?.title}
        </Link>
        <h1 className="text-xl font-semibold">{lesson.title}</h1>
      </div>

      <LessonBlockEditor lessonId={lesson.id} initialBlocks={blocks} />
    </div>
  );
}
