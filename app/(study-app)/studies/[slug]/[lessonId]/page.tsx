import { getDb } from "@/lib/db/client";
import { studies, lessons, contentBlocks, products, lessonProgress, responses } from "@/lib/db/schema";
import { eq, asc, and, inArray } from "drizzle-orm";
import { hasEntitlement } from "@/lib/entitlements/check";
import { getSession } from "@/lib/auth/session";
import { LessonBlock } from "@/components/study/LessonBlock";
import { LessonNavigation } from "@/components/study/LessonNavigation";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

// Mirrors the page's own entitlement check rather than just looking the
// lesson up directly -- metadata generation runs independently of the page
// body, so a naive lookup would leak a gated lesson's real title into the
// page <title>/browser tab for a visitor who isn't logged in or doesn't have
// access to it, even though the page itself correctly redirects them away.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; lessonId: string }>;
}): Promise<Metadata> {
  const { slug, lessonId } = await params;
  const db = await getDb();

  const study = await db.query.studies.findFirst({ where: eq(studies.slug, slug) });
  if (!study) return { title: "Studies" };

  const session = await getSession();
  if (!session) return { title: "Studies" };

  const allowed = await hasEntitlement(session.userId, study.productId);
  if (!allowed) return { title: "Studies" };

  const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId) });
  return { title: lesson?.title ?? "Studies" };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; lessonId: string }>;
}) {
  const { slug, lessonId } = await params;
  const db = await getDb();

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

  // Needed for previous/next navigation and the "back to contents" link --
  // same published-only ordering the study's own listing page uses.
  const studyLessons = await db
    .select({ id: lessons.id, orderIndex: lessons.orderIndex })
    .from(lessons)
    .where(and(eq(lessons.studyId, study.id), eq(lessons.published, true)))
    .orderBy(asc(lessons.orderIndex));
  const currentIndex = studyLessons.findIndex((l) => l.id === lesson.id);
  const previousLesson = currentIndex > 0 ? studyLessons[currentIndex - 1] : undefined;
  const nextLesson = currentIndex >= 0 && currentIndex < studyLessons.length - 1 ? studyLessons[currentIndex + 1] : undefined;

  const blocks = await db
    .select()
    .from(contentBlocks)
    .where(eq(contentBlocks.lessonId, lesson.id))
    .orderBy(asc(contentBlocks.orderIndex));

  const [progressRow] = await db
    .select({ status: lessonProgress.status })
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, session.userId), eq(lessonProgress.lessonId, lesson.id)))
    .limit(1);

  // A Study lesson's question blocks need the user's previously saved answer
  // shown back to them, not a blank field every time they revisit.
  const questionBlockIds = blocks.filter((b) => b.type === "question").map((b) => b.id);
  const savedAnswers =
    questionBlockIds.length === 0
      ? []
      : await db
          .select({ contentBlockId: responses.contentBlockId, answerText: responses.answerText })
          .from(responses)
          .where(and(eq(responses.userId, session.userId), inArray(responses.contentBlockId, questionBlockIds)));
  const answerByBlockId = new Map(savedAnswers.map((r) => [r.contentBlockId, r.answerText ?? ""]));

  const studyHref = `/studies/${slug}`;
  const previousHref = previousLesson ? `${studyHref}/${previousLesson.id}` : null;
  const nextHref = nextLesson ? `${studyHref}/${nextLesson.id}` : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-10 space-y-8 study-content-protected">
      <LessonNavigation
        studyHref={studyHref}
        studyTitle={study.title}
        lessonId={lesson.id}
        initialStatus={progressRow?.status ?? "not_started"}
        previousHref={previousHref}
        nextHref={nextHref}
        position="top"
      />
      <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">{lesson.title}</h1>
      {blocks.map((block) => (
        <LessonBlock key={block.id} block={block} initialAnswer={answerByBlockId.get(block.id)} />
      ))}
      {/* Only rendered by print CSS — invisible on screen (see globals.css). */}
      <p className="print-only-notice">
        Study content isn&apos;t available to print from the web app. If you&apos;d like a
        printed copy, the physical book is available at /books.
      </p>
      <LessonNavigation
        studyHref={studyHref}
        studyTitle={study.title}
        lessonId={lesson.id}
        initialStatus={progressRow?.status ?? "not_started"}
        previousHref={previousHref}
        nextHref={nextHref}
        position="bottom"
      />
    </div>
  );
}
