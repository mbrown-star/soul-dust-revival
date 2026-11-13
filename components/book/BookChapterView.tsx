import Link from "next/link";
import type { ParsedBookChapter } from "@/lib/book/chapterHtml";
import { QuestionBlock } from "@/components/study/QuestionBlock";
import { WalkedToggle } from "@/components/devotional/WalkedToggle";

type NavLink = { href: string; label: string } | null;

/**
 * One chapter of a book (or its Introduction): the chapter's opener, its
 * text, the "To Sit With" questions with answer boxes that save to the
 * reader's account (and collect in the Journal), the closing blessing, and
 * "Finished this chapter". Every HTML string passed in is already sanitized.
 */
export function BookChapterView({
  label,
  chapter,
  html,
  introContent,
  questions,
  blessing,
  extraContent,
  lessonId,
  initialRead,
  previous,
  next,
}: {
  label: string;
  // Null for the Introduction, or a chapter whose opener an admin rewrote:
  // then `html` (or `introContent`) is shown as it is.
  chapter: ParsedBookChapter | null;
  html: string;
  introContent?: React.ReactNode;
  questions: { id: string; prompt: string; initialAnswer?: string }[];
  blessing: { title: string; html: string } | null;
  extraContent?: React.ReactNode;
  lessonId: string;
  initialRead: boolean;
  previous: NavLink;
  next: NavLink;
}) {
  return (
    <article className="space-y-8">
      <header className="space-y-3 text-center">
        <p className="font-sans text-xs font-semibold uppercase tracking-wide text-moss">
          {chapter?.part ? `${chapter.part} · ${label}` : label}
        </p>
        {chapter && (
          <>
            <h2 className="font-display font-bold text-3xl sm:text-4xl text-ink">{chapter.title}</h2>
            {chapter.subtitle && <p className="font-serif italic text-lg text-moss">{chapter.subtitle}</p>}
          </>
        )}
      </header>

      {chapter?.epigraph && (
        <figure className="bg-white border border-dusk/10 rounded-xl p-6 text-center">
          <blockquote className="font-serif italic text-lg text-ink">{chapter.epigraph.text}</blockquote>
          <figcaption className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700 mt-3">
            {chapter.epigraph.reference}
          </figcaption>
        </figure>
      )}

      {introContent ?? (
        <div
          // The book prints its own quotation marks; the prose style's added
          // ones would wrap the reference line too ("Hosea 2:19”").
          className="prose max-w-none font-serif prose-h3:font-sans prose-h3:text-ink prose-blockquote:not-italic prose-blockquote:border-ember [&_blockquote_p]:before:content-none [&_blockquote_p]:after:content-none"
          dangerouslySetInnerHTML={{ __html: chapter ? chapter.bodyHtml : html }}
        />
      )}

      {questions.length > 0 && (
        <section aria-labelledby={`sit-with-${lessonId}`} className="space-y-6 border-t border-moss/10 pt-8">
          <div className="space-y-1">
            <h3 id={`sit-with-${lessonId}`} className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700">
              To Sit With
            </h3>
            <p className="font-sans text-sm text-moss">
              Carry these into your week. What you write here is saved to your Journal.
            </p>
          </div>
          {questions.map((q) => (
            <QuestionBlock key={q.id} contentBlockId={q.id} prompt={q.prompt} initialAnswer={q.initialAnswer} />
          ))}
        </section>
      )}

      {blessing && (
        <section className="bg-dusk/5 border-l-4 border-ember rounded-r-xl p-5 space-y-3">
          <h3 className="font-sans text-xs font-semibold uppercase tracking-wide text-moss">{blessing.title}</h3>
          <div
            className="prose max-w-none font-serif italic text-ink"
            dangerouslySetInnerHTML={{ __html: blessing.html }}
          />
        </section>
      )}

      {extraContent}

      <WalkedToggle
        lessonId={lessonId}
        initialWalked={initialRead}
        nextDayLabel={next?.label ?? null}
        actionLabel={chapter ? "Finished this chapter" : "Finished reading"}
        doneLabel="✓ Read"
      />

      {(previous || next) && (
        <nav aria-label="Chapters" className="flex flex-wrap justify-between gap-3 font-sans text-sm">
          {previous ? (
            <Link href={previous.href} className="min-h-[44px] flex items-center text-moss hover:text-ink underline underline-offset-2">
              ← {previous.label}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={next.href} className="min-h-[44px] flex items-center text-moss hover:text-ink underline underline-offset-2">
              {next.label} →
            </Link>
          )}
        </nav>
      )}
    </article>
  );
}
