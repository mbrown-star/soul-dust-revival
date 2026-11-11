import Link from "next/link";

export type JournalEntry = {
  lessonId: string;
  href: string;
  day: number;
  date: string;
  reading: string | null;
  question: string;
  answer: string;
};

/**
 * Every day's saved answer, newest day first -- matching
 * soul-dust-psalms-365's own devotional_template.html "Journal" view.
 * Reads from the real `responses` table (via the question content_block
 * scripts/backfill-devotional-question-blocks.ts creates per day), so it's
 * the account's actual saved answers, not a per-browser local list.
 */
export function JournalView({ entries }: { entries: JournalEntry[] }) {
  const sorted = [...entries].sort((a, b) => b.day - a.day);

  if (sorted.length === 0) {
    return (
      <div className="space-y-2">
        <h2 className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700">Your Answers</h2>
        <p className="font-sans text-sm text-moss">
          Every question you&apos;ve sat with this year, newest first. Tap one to return to that day.
        </p>
        <p className="font-serif italic text-moss pt-2">
          No answers yet. When you write an answer to a day&apos;s question, it collects here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700">Your Answers</h2>
        <p className="font-sans text-sm text-moss">
          Every question you&apos;ve sat with this year, newest first. Tap one to return to that day.
        </p>
      </div>
      <div className="space-y-3">
        {sorted.map((e) => (
          <Link
            key={e.lessonId}
            href={e.href}
            className="block bg-white border border-dusk/10 rounded-xl p-5 hover:border-moss/40"
          >
            <p className="font-sans text-xs font-bold uppercase tracking-wide text-ember-700">
              Day {e.day} · {e.date}
              {e.reading ? ` · ${e.reading}` : ""}
            </p>
            <p className="font-sans font-semibold text-ink mt-1 mb-2">{e.question}</p>
            <p className="font-serif text-ink whitespace-pre-wrap">{e.answer}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
