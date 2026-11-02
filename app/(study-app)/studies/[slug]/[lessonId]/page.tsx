import { db } from "@/lib/db/client";
import { studies, lessons, contentBlocks, products } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { hasEntitlement } from "@/lib/entitlements/check";
import { getSession } from "@/lib/auth/session";
import { LessonBlock } from "@/components/study/LessonBlock";
import { redirect } from "next/navigation";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; lessonId: string }>;
}) {
  const { slug, lessonId } = await params;

  const study = await db.query.studies.findFirst({ where: eq(studies.slug, slug) });
  if (!study) redirect("/studies");

  const session = await getSession();
  if (!session) redirect(`/login?next=/studies/${slug}/${lessonId}`);

  const allowed = await hasEntitlement(session.userId, study.productId);
  if (!allowed) {
    // Look up the linked product's own slug — a study's slug and its linked
    // product's slug are two different fields on two different rows and are
    // never guaranteed to match, so reusing the study's slug here would send
    // people to the wrong (or a nonexistent) product page.
    const product = await db.query.products.findFirst({ where: eq(products.id, study.productId) });
    redirect(product ? `/books/${product.slug}` : "/books");
  }

  const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId) });
  if (!lesson) redirect(`/studies/${slug}`);

  const blocks = await db
    .select()
    .from(contentBlocks)
    .where(eq(contentBlocks.lessonId, lesson.id))
    .orderBy(asc(contentBlocks.orderIndex));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-10 space-y-8 study-content-protected">
      <h1 className="text-2xl font-semibold">{lesson.title}</h1>
      {blocks.map((block) => (
        <LessonBlock key={block.id} block={block} />
      ))}
      {/* Only rendered by print CSS — invisible on screen (see globals.css). */}
      <p className="print-only-notice">
        Study content isn&apos;t available to print from the web app. If you&apos;d like a
        printed copy, the physical book is available at /books.
      </p>
    </div>
  );
}
