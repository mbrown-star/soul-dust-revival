import Link from "next/link";
import Image from "next/image";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { lessons, studies } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { AuthForm } from "@/components/auth/AuthForm";
import { appUrl } from "@/lib/domains";
import { getDisplayStudyTitles } from "@/lib/study/displayTitle";
import { studyKindLabel } from "@/lib/study/studyKindLabel";
import { shortLessonLabel } from "@/lib/study/shortLessonLabel";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Try a free sample",
};

const KIND_BLURB: Record<string, string> = {
  study: "The passage, the Greek word studies, real questions to answer, and a week of practices to live out.",
  devotional: "A psalm, a verse to hold onto, a short reflection, and a question to sit with.",
};

export default async function SneakPeekPage() {
  const session = await getSession();
  const db = await getDb();

  // Whatever is marked as the free sample (lessons.isSample) -- published
  // sample lessons of published studies, the same rule the reader enforces.
  const sampleLessons = await db
    .select({ studyId: lessons.studyId, title: lessons.title })
    .from(lessons)
    .innerJoin(studies, eq(studies.id, lessons.studyId))
    .where(and(eq(lessons.isSample, true), eq(lessons.published, true), eq(studies.published, true)))
    .orderBy(asc(lessons.orderIndex));
  const studyIds = [...new Set(sampleLessons.map((l) => l.studyId))];
  const sampleStudies =
    studyIds.length === 0 ? [] : await db.select().from(studies).where(inArray(studies.id, studyIds));
  const titles = await getDisplayStudyTitles(db, sampleStudies);

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
      <p className="font-sans text-xs uppercase tracking-wide text-ember-700 mb-2">Sneak peek</p>
      <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink mb-4">See what a study feels like</h1>
      <p className="font-serif text-moss max-w-2xl mb-10">
        Before the full launch, try the real thing: a few weeks of a Soul Dust Revival study and a few days of
        the devotional, in the same app you&apos;ll use when everything opens. The rest unlocks at launch and
        purchase.
      </p>

      <div className="grid gap-10 md:grid-cols-2 md:gap-12 items-start">
        <ul className="space-y-4">
          {sampleStudies.map((study) => {
            const included = sampleLessons.filter((l) => l.studyId === study.id).map((l) => shortLessonLabel(l.title));
            return (
              <li key={study.id} className="flex gap-4 bg-white border border-dusk/10 rounded-lg p-4">
                {study.coverImageUrl && (
                  <Image
                    src={study.coverImageUrl}
                    alt={study.coverImageAlt ?? ""}
                    width={0}
                    height={0}
                    sizes="96px"
                    className="w-20 sm:w-24 h-auto self-start rounded shadow"
                  />
                )}
                <div className="min-w-0">
                  <p className="font-sans text-xs uppercase tracking-wide text-moss mb-1">{studyKindLabel(study.kind)}</p>
                  <h2 className="font-display font-semibold text-lg text-ink mb-1">
                    {titles.get(study.id) ?? study.title}
                  </h2>
                  {KIND_BLURB[study.kind] && <p className="font-serif text-sm text-moss mb-2">{KIND_BLURB[study.kind]}</p>}
                  <p className="font-sans text-xs text-moss">
                    Free: {included.join(", ")}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Form first on a phone, so it isn't below the fold under both cards. */}
        <div className="order-first md:order-none bg-dusk/5 border border-dusk/10 rounded-lg p-6">
          {session ? (
            <div className="space-y-4">
              <h2 className="font-display font-bold text-2xl text-ink">You&apos;re in</h2>
              <p className="text-sm text-moss">Your sample is waiting in the app.</p>
              <Link
                href={appUrl("/library")}
                className="inline-flex items-center justify-center w-full min-h-[44px] bg-ink text-parchment rounded-lg p-3 font-sans font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink"
              >
                Open my sample
              </Link>
            </div>
          ) : (
            <AuthForm mode="sneak_peek" next="/library" />
          )}
        </div>
      </div>
    </div>
  );
}
