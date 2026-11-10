import Link from "next/link";
import { parseDevotionalHtml } from "@/lib/devotional/parseDevotionalHtml";
import { HideWordsSlider } from "./HideWordsSlider";
import { ReadAloudButton } from "./ReadAloudButton";
import { QuestionBlock } from "@/components/study/QuestionBlock";
import { WalkedToggle } from "./WalkedToggle";

/**
 * The single-day devotional reading experience: a key-verse card (with a
 * memorization slider), the day's reading, "Lift Up Your Eyes" as a dark
 * callout, and "A Question to Sit With" as a real saved answer (via
 * QuestionBlock, once soul-dust-psalms-365's own devotional_template.html
 * reference showed this should be an input, not display-only text) --
 * matching the reference's own plain (not dark-card) treatment for this
 * section. Parses the lesson's existing stored HTML at render time (see
 * parseDevotionalHtml) -- no data migration needed, works for every
 * already-imported day.
 */
export function DevotionalDayView({
  dayLabel,
  bodyHtml,
  previousHref,
  nextHref,
  lessonId,
  questionBlockId,
  initialAnswer,
  initialWalked,
  pickUpWithToday,
  extraContent,
}: {
  dayLabel: string;
  bodyHtml: string;
  previousHref: string | null;
  nextHref: string | null;
  lessonId: string;
  // Null until scripts/backfill-devotional-question-blocks.ts has run for
  // this lesson -- falls back to the plain display-only text so an
  // unbackfilled lesson still renders its question rather than losing it.
  questionBlockId: string | null;
  initialAnswer?: string;
  initialWalked: boolean;
  // Set only when the day being viewed isn't the real day on the calendar --
  // the book's own preface says there's no need to hurry to catch up, so
  // this is an offer, not a nag.
  pickUpWithToday?: { href: string } | null;
  // Any other blocks an admin added to this day (images, video, callouts...),
  // rendered after the day's own printed parts, in the builder's order.
  extraContent?: React.ReactNode;
}) {
  const parsed = parseDevotionalHtml(bodyHtml);

  const readAloudText = [
    parsed.title,
    parsed.keyVerseQuote,
    ...parsed.bodyParagraphs,
    parsed.liftUpParagraphs.length ? "Lift up your eyes." : null,
    ...parsed.liftUpParagraphs,
    parsed.questionParagraphs.length ? "A question to sit with." : null,
    ...parsed.questionParagraphs,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        {previousHref ? (
          <Link
            href={previousHref}
            aria-label="Previous day"
            className="flex items-center justify-center w-11 h-11 rounded-full border border-moss/30 hover:border-moss/60 shrink-0"
          >
            ←
          </Link>
        ) : (
          <span className="w-11 h-11 shrink-0" aria-hidden="true" />
        )}
        <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700 text-center">
          {dayLabel}
        </p>
        {nextHref ? (
          <Link
            href={nextHref}
            aria-label="Next day"
            className="flex items-center justify-center w-11 h-11 rounded-full border border-moss/30 hover:border-moss/60 shrink-0"
          >
            →
          </Link>
        ) : (
          <span className="w-11 h-11 shrink-0" aria-hidden="true" />
        )}
      </div>

      {parsed.title && (
        <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink text-center">{parsed.title}</h1>
      )}

      {pickUpWithToday && (
        <div className="flex flex-wrap items-center gap-3 bg-dusk/5 rounded-xl px-4 py-3">
          <span className="flex-1 min-w-0 font-sans text-sm text-moss">No need to hurry to catch up.</span>
          <Link
            href={pickUpWithToday.href}
            className="font-sans text-sm font-semibold border border-moss/30 rounded-full px-4 py-2 min-h-[44px] flex items-center hover:border-moss/60"
          >
            Pick up with today
          </Link>
        </div>
      )}

      {parsed.keyVerseQuote && (
        <div className="bg-white border border-dusk/10 rounded-xl p-6">
          <HideWordsSlider verse={parsed.keyVerseQuote} />
          {parsed.keyVerseCitation && (
            <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700 mt-3">
              {parsed.keyVerseCitation.replace(/^—\s*/, "")}
            </p>
          )}
        </div>
      )}

      <ReadAloudButton text={readAloudText} />

      <div className="prose max-w-none font-serif">
        {/* paragraphsToHtml (lib/import/splitIntoLessons.ts) HTML-escapes
            every paragraph and never emits inline tags -- these are plain
            text, safe to render directly without dangerouslySetInnerHTML. */}
        {parsed.bodyParagraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      {parsed.liftUpParagraphs.length > 0 && (
        <div className="bg-dusk/5 border-l-4 border-ember rounded-r-xl p-5">
          {/* FIXED (axe-core, qa/e2e/specs/accessibility.spec.ts): text-ember-700
              at this size (text-xs, not bold) was 4.46:1 against the real
              composited background, just under WCAG AA's 4.5:1 -- ember-700
              only clears AA at large/bold sizes (CLAUDE.md, 2026-11-05).
              moss is the project's own small-accent-text token and clears
              6.1:1 here. */}
          <p className="font-sans text-xs font-semibold uppercase tracking-wide text-moss mb-2">
            Lift Up Your Eyes
          </p>
          {parsed.liftUpParagraphs.map((p, i) => (
            <p key={i} className="font-serif italic text-ink">
              {p}
            </p>
          ))}
        </div>
      )}

      {parsed.questionParagraphs.length > 0 && (
        <div>
          <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700 mb-2">
            A Question to Sit With
          </p>
          {questionBlockId ? (
            <QuestionBlock
              contentBlockId={questionBlockId}
              prompt={parsed.questionParagraphs.join(" ")}
              initialAnswer={initialAnswer}
            />
          ) : (
            <>
              <p className="font-display text-xl text-ink mb-4">{parsed.questionParagraphs.join(" ")}</p>
              <p className="font-serif italic text-moss">
                Answer it out loud, or write it here — saving isn&apos;t available for this day yet.
              </p>
            </>
          )}
        </div>
      )}

      {extraContent}

      <WalkedToggle lessonId={lessonId} initialWalked={initialWalked} nextDayLabel={nextHref ? "Tomorrow" : null} />
    </div>
  );
}
