import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { journeys, products } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getJourneyAccess } from "@/lib/entitlements/check";
import { completedCount, currentStopIndex, loadJourneyProgress, rhythmOf } from "@/lib/journey/load";
import { loadLookBack } from "@/lib/journey/lookBack";
import { formatOpensOn, openedThroughToday, stopOpensOn, weekdayName } from "@/lib/journey/schedule";
import { JourneyMap } from "@/components/journey/JourneyMap";
import { JourneyDayForm } from "@/components/journey/JourneyDayForm";
import { LookBackList } from "@/components/journey/LookBackList";
import { YearRing } from "@/components/journey/YearRing";
import { marketingUrl } from "@/lib/domains";

// Per-reader progress and today's date in his own time zone: never static.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "The Journey" };

const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const countWord = (n: number) => COUNT_WORDS[n] ?? String(n);

export default async function JourneyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/journey/${slug}`);

  const db = await getDb();
  const journey = await db.query.journeys.findFirst({ where: eq(journeys.slug, slug) });
  if (!journey) redirect("/library");

  const access = await getJourneyAccess(session, journey);
  if (!journey.published && !access.isAdminPreview) redirect("/library");
  if (!access.allowed) {
    const bundle = await db.query.products.findFirst({
      where: eq(products.id, journey.bundleProductId),
      columns: { slug: true, active: true },
    });
    redirect(bundle?.active ? marketingUrl(`/store/${bundle.slug}`) : "/library");
  }

  const progress = await loadJourneyProgress(db, journey, session.userId);
  const total = progress.stops.length;
  const begun = !!progress.enrollment;
  const done = completedCount(progress);
  const finished = begun && total > 0 && done === total;
  const current = begun ? progress.stops[currentStopIndex(progress)] : undefined;
  const currentState = current ? progress.states[current.index] : undefined;

  // When the next week opens, for "Your next week opens Tuesday, Nov 18".
  let nextOpening: string | null = null;
  if (progress.enrollment && progress.today && !finished) {
    const rhythm = rhythmOf(progress.enrollment);
    const nextIndex = openedThroughToday(rhythm, progress.today) + 1;
    if (nextIndex < total) nextOpening = stopOpensOn(rhythm, nextIndex);
  }

  const finalLookBack =
    finished && progress.parts.length > 0
      ? await loadLookBack(db, progress, progress.parts.length - 1, session.userId)
      : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-10 space-y-10">
      {!journey.published && (
        <p role="status" className="text-sm rounded-lg bg-gold/20 text-ink px-4 py-2">
          Admin preview: this Journey isn&apos;t published, so readers still see its Parts as separate studies.
        </p>
      )}

      <header className="rounded-2xl bg-ink text-parchment mottle px-6 py-8 sm:px-10 sm:py-10 flex flex-col sm:flex-row sm:items-center gap-6">
        <div className="flex-1 min-w-0 space-y-2">
          <p className="font-sans text-xs font-semibold uppercase tracking-wide text-gold">Soul Dust Revival</p>
          <h1 className="font-display font-bold text-4xl sm:text-5xl">{journey.title}</h1>
          <p className="font-serif text-lg text-parchment/85 max-w-xl">
            {total} weeks. {countWord(progress.parts.length)} {progress.parts.length === 1 ? "Part" : "Parts"}. One road out of
            the dust and into life, walked one week at a time.
          </p>
        </div>
        {begun && <YearRing done={done} total={total} />}
      </header>

      {!begun ? (
        <section aria-labelledby="begin-heading" className="grid gap-8 sm:grid-cols-2">
          <div className="space-y-3">
            <h2 id="begin-heading" className="font-display font-bold text-2xl text-ink">
              Before you begin
            </h2>
            <p className="font-serif text-ink">
              The Journey isn&apos;t meant to be rushed. Each week opens on your own Journey day, so the road takes a
              year. Take the weeks in order. If life gets in the way, the weeks wait for you, and you pick up where you
              left off.
            </p>
            <p className="font-serif text-ink">
              Each Part opens with a threshold: a moment to look back at what you wrote and cross into what&apos;s
              next.
            </p>
          </div>
          <div className="rounded-xl border border-dusk/10 bg-white p-6">
            {access.isAdminPreview && progress.stops.length === 0 ? (
              <p className="font-serif text-moss">No published lessons yet. Publish the Parts&apos; lessons to lay out the road.</p>
            ) : (
              <JourneyDayForm journeyId={journey.id} mode="begin" />
            )}
          </div>
        </section>
      ) : finished ? (
        <section aria-labelledby="finished-heading" className="rounded-xl border border-dusk/10 bg-white p-6 space-y-2">
          <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700">Journey complete</p>
          <h2 id="finished-heading" className="font-display font-bold text-2xl text-ink">
            You walked the whole road.
          </h2>
          <p className="font-serif text-ink">
            Every week, every Part. Read back over what you wrote, and carry it with you.
          </p>
        </section>
      ) : current ? (
        <section aria-labelledby="continue-heading" className="rounded-xl border border-dusk/10 bg-white p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700">
              {currentState?.state === "open" ? "This week" : "Up next"}
            </p>
            <h2 id="continue-heading" className="font-display font-bold text-2xl text-ink">
              {current.isThreshold ? `${current.label}: Introduction` : current.title}
            </h2>
            <p className="font-serif text-moss">
              {currentState?.state === "open"
                ? nextOpening
                  ? `Your next week opens ${formatOpensOn(nextOpening)}.`
                  : "This is the last stop on the road."
                : currentState?.state === "waiting"
                  ? `Opens ${formatOpensOn(currentState.opensOn)}. Until then, read back over the weeks behind you.`
                  : ""}
            </p>
          </div>
          {currentState?.state === "open" && (
            <Link
              href={current.href}
              className="shrink-0 min-h-[44px] px-6 rounded-full bg-ember-700 text-parchment font-sans font-semibold text-sm flex items-center justify-center"
            >
              {done === 0 ? "Begin" : "Continue"}
            </Link>
          )}
        </section>
      ) : null}

      {finalLookBack && <LookBackList lookBack={finalLookBack} heading="The last Part, in your own words" />}

      {(begun || access.isAdminPreview) && (
        <JourneyMap parts={progress.parts} stops={progress.stops} states={progress.states} isAdminPreview={access.isAdminPreview} />
      )}

      {progress.enrollment && !finished && (
        <section aria-labelledby="rhythm-heading" className="rounded-xl border border-dusk/10 bg-white p-6 space-y-3">
          <h2 id="rhythm-heading" className="font-display font-bold text-xl text-ink">
            Your rhythm
          </h2>
          <p className="font-serif text-moss">
            Your weeks open on {weekdayName(progress.enrollment.weekday)}s.
          </p>
          <JourneyDayForm journeyId={journey.id} mode="change" currentWeekday={progress.enrollment.weekday} />
        </section>
      )}
    </div>
  );
}
