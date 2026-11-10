import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { AuthForm } from "@/components/auth/AuthForm";
import { appUrl } from "@/lib/domains";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Try a free sample",
};

const SAMPLES = [
  {
    kind: "Study",
    title: "Colossians",
    body: "The introduction and the first three weeks: the passage, the Greek word studies, real questions to answer, and a week of practices to live out.",
  },
  {
    kind: "Devotional",
    title: "365 Days of Psalms",
    body: "The introduction and the first three days: a psalm, a verse to hold onto, a short reflection, and a question to sit with.",
  },
];

export default async function SneakPeekPage() {
  const session = await getSession();

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
          {SAMPLES.map((sample) => (
            <li key={sample.title} className="bg-white border border-dusk/10 rounded-lg p-5">
              <p className="font-sans text-xs uppercase tracking-wide text-moss mb-1">{sample.kind}</p>
              <h2 className="font-display font-semibold text-xl text-ink mb-2">{sample.title}</h2>
              <p className="font-serif text-sm text-moss">{sample.body}</p>
            </li>
          ))}
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
