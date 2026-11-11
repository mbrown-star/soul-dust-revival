import Link from "next/link";
import Image from "next/image";
import { ProgressBar } from "@/components/study/ProgressBar";

/**
 * My Library's one card for a whole Journey, in place of a card per Part.
 * Styled like LibraryCard so it sits in the same grid.
 */
export function JourneyCard({
  title,
  href,
  coverImageUrl,
  coverImageAlt,
  partCount,
  done,
  total,
  begun,
  nextLine,
}: {
  title: string;
  href: string;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  partCount: number;
  done: number;
  total: number;
  begun: boolean;
  /** "Week 17: Not Moralism", or when it opens. */
  nextLine: string | null;
}) {
  const finished = begun && total > 0 && done === total;
  return (
    <div className="bg-white border border-dusk/10 rounded-xl overflow-hidden hover:border-dusk/30 transition-colors flex flex-col sm:flex-row sm:col-span-2">
      <Link href={href} className="shrink-0 flex justify-center bg-ink mottle p-4 sm:w-40 sm:items-center">
        {coverImageUrl ? (
          <Image
            src={coverImageUrl}
            alt={coverImageAlt || ""}
            width={0}
            height={0}
            sizes="160px"
            className="w-32 h-auto rounded"
          />
        ) : (
          <div className="w-32 aspect-[2/3] flex items-center justify-center text-gold font-display text-3xl">J</div>
        )}
      </Link>
      <div className="flex-1 p-5 flex flex-col gap-2">
        <span className="inline-block text-xs font-sans font-medium uppercase tracking-wide text-ember-700">
          The Journey · {partCount} Parts · {total} weeks
        </span>
        <h3 className="font-display font-semibold text-xl text-ink leading-tight">
          <Link href={href} className="hover:underline">
            {title}
          </Link>
        </h3>
        <p className="font-serif text-sm text-moss">
          {!begun
            ? "A year-long road, one week at a time. Choose your Journey day to begin."
            : finished
              ? "You walked the whole road."
              : nextLine}
        </p>
        {begun && total > 0 && (
          <div className="flex items-center gap-3 mt-1">
            <div className="flex-1">
              <ProgressBar completed={done} total={total} />
            </div>
            <span className="font-sans text-xs text-moss whitespace-nowrap">
              {done}/{total} weeks
            </span>
          </div>
        )}
        <div className="mt-auto pt-2">
          <Link
            href={href}
            className="inline-flex items-center justify-center bg-ink text-parchment rounded-lg px-4 py-2 text-sm font-medium min-h-[40px]"
          >
            {!begun ? "Begin the Journey" : finished ? "Look back" : "Continue"}
          </Link>
        </div>
      </div>
    </div>
  );
}
