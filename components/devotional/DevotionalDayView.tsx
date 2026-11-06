import Link from "next/link";
import { parseDevotionalHtml } from "@/lib/devotional/parseDevotionalHtml";
import { HideWordsSlider } from "./HideWordsSlider";
import { ReadAloudButton } from "./ReadAloudButton";

/**
 * The single-day devotional reading experience: a key-verse card (with a
 * memorization slider), the day's reading, and the book's own "Lift Up Your
 * Eyes" / "A Question to Sit With" sections each given their own visual
 * treatment instead of reading as one undifferentiated scroll of paragraphs.
 * Parses the lesson's existing stored HTML at render time (see
 * parseDevotionalHtml) -- no data migration needed, works for every
 * already-imported day.
 */
export function DevotionalDayView({
  dayLabel,
  bodyHtml,
  previousHref,
  nextHref,
}: {
  dayLabel: string;
  bodyHtml: string;
  previousHref: string | null;
  nextHref: string | null;
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
          <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700 mb-2">
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
        <div className="bg-ink text-parchment rounded-xl p-6">
          <p className="font-sans text-xs font-semibold uppercase tracking-wide text-gold mb-2">
            A Question to Sit With
          </p>
          {parsed.questionParagraphs.map((p, i) => (
            <p key={i} className="font-serif italic text-lg">
              {p}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
