import { getDb } from "@/lib/db/client";
import { studies, products, lessons } from "@/lib/db/schema";
import { eq, asc, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { StudyForm } from "@/components/admin/StudyForm";
import Link from "next/link";
import { NewLessonButton } from "@/components/admin/NewLessonButton";

export default async function StudyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const study = await db.query.studies.findFirst({ where: eq(studies.id, id) });
  if (!study) redirect("/admin/studies");

  // A format "both" product's digital side grants an entitlement exactly
  // like a plain "digital" product (see lib/stripe/webhook-handlers.ts's
  // isDigitalVariant) -- excluding it here left every "both" product
  // unable to gate a study at all.
  const digitalProducts = await db
    .select({ id: products.id, title: products.title })
    .from(products)
    .where(or(eq(products.format, "digital"), eq(products.format, "both")));

  const studyLessons = await db
    .select()
    .from(lessons)
    .where(eq(lessons.studyId, study.id))
    .orderBy(asc(lessons.orderIndex));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-semibold mb-4">Edit study</h1>
        {study.sourceFileName && (
          <p className="text-sm text-moss mb-4">
            Imported from{" "}
            <a href={study.sourceFileUrl ?? "#"} className="underline" target="_blank">
              {study.sourceFileName}
            </a>
            . Review the auto-generated lessons below before publishing.
          </p>
        )}
        <StudyForm
          digitalProducts={digitalProducts}
          initial={{
            id: study.id,
            title: study.title,
            slug: study.slug,
            description: study.description ?? "",
            coverImageUrl: study.coverImageUrl,
            coverImageAlt: study.coverImageAlt ?? "",
            productId: study.productId,
            published: study.published,
          }}
        />
      </div>

      <div>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold">Lessons</h2>
          <NewLessonButton studyId={study.id} />
        </div>

        <div className="divide-y border rounded-lg">
          {studyLessons.map((lesson) => (
            <Link
              key={lesson.id}
              href={`/admin/studies/${study.id}/lessons/${lesson.id}`}
              className="flex flex-wrap justify-between items-center gap-2 p-4 hover:bg-moss/5"
            >
              <span>{lesson.title}</span>
              <span className="text-sm text-moss">{!lesson.published && "draft"}</span>
            </Link>
          ))}
          {studyLessons.length === 0 && <p className="p-4 text-moss">No lessons yet.</p>}
        </div>
      </div>
    </div>
  );
}
