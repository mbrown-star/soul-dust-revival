import Link from "next/link";

export type BookJournalChapter = {
  lessonId: string;
  href: string;
  label: string; // "Chapter 1"
  title: string | null;
  answers: { question: string; answer: string }[];
};

/**
 * Every answer this reader has written to a chapter's "To Sit With"
 * questions, in book order. Read from their saved answers (the `responses`
 * table), so it's the same on every device.
 */
export function BookJournal({ chapters }: { chapters: BookJournalChapter[] }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700">Your Answers</h2>
        <p className="font-sans text-sm text-moss">
          What you&apos;ve written to each chapter&apos;s questions, in book order. Tap a chapter to return to it.
        </p>
      </div>
      {chapters.length === 0 ? (
        <p className="font-serif italic text-moss pt-2">
          No answers yet. When you answer a chapter&apos;s To Sit With questions, they collect here.
        </p>
      ) : (
        <div className="space-y-3">
          {chapters.map((c) => (
            <Link
              key={c.lessonId}
              href={c.href}
              className="block bg-white border border-dusk/10 rounded-xl p-5 hover:border-moss/40 space-y-3"
            >
              <p className="font-sans text-xs font-bold uppercase tracking-wide text-moss">
                {c.label}
                {c.title ? ` · ${c.title}` : ""}
              </p>
              {c.answers.map((a, i) => (
                <div key={i}>
                  <p className="font-sans font-semibold text-ink mb-1">{a.question}</p>
                  <p className="font-serif text-ink whitespace-pre-wrap">{a.answer}</p>
                </div>
              ))}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
