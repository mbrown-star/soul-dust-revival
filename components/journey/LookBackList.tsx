import Link from "next/link";
import type { LookBack } from "@/lib/journey/lookBack";

/**
 * What a reader wrote in one Part, week by week, each week collapsible.
 * Shown at the threshold into the next Part and when the Journey is done.
 */
export function LookBackList({ lookBack, heading }: { lookBack: LookBack; heading: string }) {
  return (
    <section aria-labelledby="look-back-heading" className="space-y-4">
      <div>
        <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700">Look back</p>
        <h2 id="look-back-heading" className="font-display font-bold text-xl sm:text-2xl text-ink">
          {heading}
        </h2>
        <p className="font-serif text-moss mt-1">
          {lookBack.weeks.length === 0
            ? `You didn't write answers in ${lookBack.partLabel}. That's all right. The road is still under your feet.`
            : `What you wrote in ${lookBack.partLabel}, in your own words. Read it slowly before you go on.`}
        </p>
      </div>
      {lookBack.weeks.length > 0 && (
        <div className="divide-y divide-dusk/10 border-y border-dusk/10">
          {lookBack.weeks.map((week) => (
            <details key={week.lessonId} className="group py-1">
              <summary className="flex items-center gap-3 py-3 min-h-[44px] cursor-pointer list-none">
                <span
                  aria-hidden="true"
                  className="text-moss transition-transform group-open:rotate-90 motion-reduce:transition-none"
                >
                  ›
                </span>
                <span className="flex-1 min-w-0 font-sans font-semibold text-ink">{week.title}</span>
                <span className="shrink-0 font-sans text-xs text-moss">
                  {week.answers.length} {week.answers.length === 1 ? "answer" : "answers"}
                </span>
              </summary>
              <div className="pb-4 pl-6 space-y-4">
                {week.answers.map((a, i) => (
                  <div key={i} className="space-y-1">
                    <p className="font-sans text-sm font-semibold text-moss">{a.prompt}</p>
                    <p className="font-serif text-ink whitespace-pre-line">{a.answer}</p>
                  </div>
                ))}
                <Link href={week.href} className="inline-block text-sm text-moss hover:text-ink underline underline-offset-2">
                  Open {week.label}
                </Link>
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
