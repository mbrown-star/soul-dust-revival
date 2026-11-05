import { getDb } from "@/lib/db/client";
import { entitlements, studies, lessons, lessonProgress } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ProgressBar } from "@/components/study/ProgressBar";
import type { Metadata } from "next";

// Needed for the nonce-based CSP in proxy.ts (see app/(marketing)/account/page.tsx
// for the same reasoning) -- this page reads per-user data from the database
// on every request, so it can never be statically prerendered anyway.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your Studies",
};

export default async function StudiesPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/studies");
  const db = await getDb();

  const entitledRows = await db
    .select({ productId: entitlements.productId })
    .from(entitlements)
    .where(eq(entitlements.userId, session.userId));
  const productIds = entitledRows.map((e) => e.productId);

  const myStudies =
    productIds.length === 0
      ? []
      : await db
          .select()
          .from(studies)
          .where(and(inArray(studies.productId, productIds), eq(studies.published, true)));

  const studyIds = myStudies.map((s) => s.id);
  const allLessons =
    studyIds.length === 0
      ? []
      : await db
          .select()
          .from(lessons)
          .where(and(inArray(lessons.studyId, studyIds), eq(lessons.published, true)));

  const lessonIds = allLessons.map((l) => l.id);
  const myProgress =
    lessonIds.length === 0
      ? []
      : await db
          .select()
          .from(lessonProgress)
          .where(
            and(eq(lessonProgress.userId, session.userId), inArray(lessonProgress.lessonId, lessonIds))
          );
  const completedLessonIds = new Set(
    myProgress.filter((p) => p.status === "completed").map((p) => p.lessonId)
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink mb-2">Your Studies</h1>
      <p className="font-serif text-moss mb-10 max-w-xl">
        Pick up where you left off, or start something new.
      </p>

      {myStudies.length === 0 ? (
        <div className="bg-dusk/5 border border-dusk/10 rounded-lg p-8 text-center">
          <p className="font-serif text-moss mb-4">You don&apos;t have any studies yet.</p>
          <Link
            href="/books"
            className="inline-block bg-ink text-parchment rounded-lg px-5 py-3 font-sans text-sm font-medium min-h-[44px]"
          >
            Browse studies &amp; books
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {myStudies.map((study) => {
            const studyLessons = allLessons.filter((l) => l.studyId === study.id);
            const completed = studyLessons.filter((l) => completedLessonIds.has(l.id)).length;
            return (
              <li key={study.id}>
                <Link
                  href={`/studies/${study.slug}`}
                  className="block bg-white border border-dusk/10 rounded-lg p-5 hover:border-dusk/30 transition-colors focus:outline-none focus:ring-2 focus:ring-ink"
                >
                  <h2 className="font-display font-semibold text-lg text-ink mb-1">{study.title}</h2>
                  {study.description && (
                    <p className="font-serif text-sm text-moss mb-3 line-clamp-2">{study.description}</p>
                  )}
                  {studyLessons.length > 0 && (
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <ProgressBar completed={completed} total={studyLessons.length} />
                      </div>
                      <span className="font-sans text-xs text-moss whitespace-nowrap">
                        {completed}/{studyLessons.length} lessons
                      </span>
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
