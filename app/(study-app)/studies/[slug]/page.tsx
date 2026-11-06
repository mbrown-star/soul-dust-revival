import { getDb } from "@/lib/db/client";
import { studies, lessons, products, lessonProgress } from "@/lib/db/schema";
import { eq, asc, and, inArray } from "drizzle-orm";
import { hasEntitlement } from "@/lib/entitlements/check";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ProgressBar } from "@/components/study/ProgressBar";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

// Mirrors [lessonId]/page.tsx's own generateMetadata -- don't leak a gated
// study's real title into the page <title> for a visitor who isn't logged
// in or doesn't have access to it, even though the page body redirects
// them away correctly either way.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const db = await getDb();

  const study = await db.query.studies.findFirst({ where: eq(studies.slug, slug) });
  if (!study || !study.published) return { title: "Studies" };

  const session = await getSession();
  if (!session) return { title: "Studies" };

  const allowed = await hasEntitlement(session.userId, study.productId);
  return { title: allowed ? study.title : "Studies" };
}

export default async function StudyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = await getDb();

  const study = await db.query.studies.findFirst({ where: eq(studies.slug, slug) });
  // An unpublished study isn't ready for a customer to see at all -- treat
  // it the same as "doesn't exist" rather than gating it only by
  // entitlement, so a draft can't leak just because someone bought the
  // linked product early.
  if (!study || !study.published) redirect("/studies");

  const session = await getSession();
  if (!session) redirect(`/login?next=/studies/${slug}`);

  const allowed = await hasEntitlement(session.userId, study.productId);
  if (!allowed) {
    // The study's slug and its linked product's slug are two different
    // fields on two different rows and are never guaranteed to match, so
    // reusing the study's slug here would send people to the wrong (or a
    // nonexistent) product page -- same reasoning as [lessonId]/page.tsx.
    const product = await db.query.products.findFirst({ where: eq(products.id, study.productId) });
    redirect(product ? `/books/${product.slug}` : "/books");
  }

  const studyLessons = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.studyId, study.id), eq(lessons.published, true)))
    .orderBy(asc(lessons.orderIndex));

  const lessonIds = studyLessons.map((l) => l.id);
  const progressRows =
    lessonIds.length === 0
      ? []
      : await db
          .select()
          .from(lessonProgress)
          .where(
            and(eq(lessonProgress.userId, session.userId), inArray(lessonProgress.lessonId, lessonIds))
          );
  const progressByLesson = new Map(progressRows.map((p) => [p.lessonId, p.status]));
  const completed = studyLessons.filter((l) => progressByLesson.get(l.id) === "completed").length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
      <span className="inline-block text-xs font-sans font-medium uppercase tracking-wide text-ember-700 mb-2">
        {study.kind === "study" ? "Study" : "Devotional"}
      </span>
      <h1 className="font-display font-bold text-3xl text-ink mb-2">{study.title}</h1>
      {study.description && <p className="font-serif text-moss mb-6">{study.description}</p>}

      {studyLessons.length > 0 && (
        <div className="flex items-center gap-3 mb-8">
          <div className="flex-1">
            <ProgressBar completed={completed} total={studyLessons.length} />
          </div>
          <span className="font-sans text-xs text-moss whitespace-nowrap">
            {completed}/{studyLessons.length} lessons
          </span>
        </div>
      )}

      {studyLessons.length === 0 ? (
        <p className="font-serif text-moss">Lessons for this study are coming soon.</p>
      ) : (
        <ol className="space-y-2">
          {studyLessons.map((lesson, i) => {
            const status = progressByLesson.get(lesson.id) ?? "not_started";
            return (
              <li key={lesson.id}>
                <Link
                  href={`/studies/${slug}/${lesson.id}`}
                  className="flex items-center justify-between gap-4 bg-white border border-dusk/10 rounded-lg px-4 py-3 min-h-[44px] hover:border-dusk/30 transition-colors focus:outline-none focus:ring-2 focus:ring-ink"
                >
                  <span className="font-sans text-ink">
                    <span className="text-moss mr-2">{i + 1}.</span>
                    {lesson.title}
                  </span>
                  {status !== "not_started" && (
                    <span className="font-sans text-xs uppercase tracking-wide text-moss whitespace-nowrap">
                      {status === "completed" ? "Completed" : "In progress"}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
