import Link from "next/link";
import Image from "next/image";
import { ProgressBar } from "./ProgressBar";
import { RestartStudyButton } from "./RestartStudyButton";
import { studyKindLabel, type StudyKind } from "@/lib/study/studyKindLabel";
import { LockIcon } from "./LockIcon";
import { lockedLessonNote } from "@/lib/launchMode";

type LibraryCardStudy = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  kind: StudyKind;
};

export function LibraryCard({
  study,
  completed,
  total,
  unit,
  resumeHref,
  showRestart,
  sampleOnly = false,
  lockedCount = 0,
}: {
  study: LibraryCardStudy;
  completed: number;
  total: number;
  unit: string;
  resumeHref: string;
  showRestart: boolean;
  /**
   * Read as a free sample -- the reader hasn't bought this study, and
   * `total` counts only the sample lessons they can open.
   */
  sampleOnly?: boolean;
  /** Lessons past the free sample. */
  lockedCount?: number;
}) {
  const lessonNoun = study.kind === "devotional" ? (lockedCount === 1 ? "day" : "days") : lockedCount === 1 ? "lesson" : "lessons";
  return (
    <div className="bg-white border border-dusk/10 rounded-xl overflow-hidden hover:border-dusk/30 transition-colors flex flex-col sm:flex-row">
      {/* The cover shows at its own natural shape (height: auto), never
          cropped to a square, so its whole border box stays visible. */}
      <Link href={resumeHref} className="shrink-0 flex justify-center bg-dusk/5 p-4 sm:p-0 sm:w-32 sm:self-start">
        {study.coverImageUrl ? (
          <Image
            src={study.coverImageUrl}
            // Cover alt text is optional (as on products), so fall back to the title.
            alt={study.coverImageAlt || `${study.title} — Front cover`}
            width={0}
            height={0}
            sizes="128px"
            className="w-32 sm:w-full h-auto rounded sm:rounded-none"
          />
        ) : (
          <div className="w-32 sm:w-full aspect-[2/3] flex items-center justify-center text-moss/40 font-display text-3xl">
            {study.title.charAt(0)}
          </div>
        )}
      </Link>
      <div className="flex-1 p-5 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-block text-xs font-sans font-medium uppercase tracking-wide text-ember-700 mb-1">
              {studyKindLabel(study.kind)}
              {sampleOnly && " · Sneak peek"}
            </span>
            <h3 className="font-display font-semibold text-lg text-ink leading-tight">
              <Link href={resumeHref} className="hover:underline">
                {study.title}
              </Link>
            </h3>
          </div>
        </div>
        {study.description && <p className="font-serif text-sm text-moss line-clamp-2">{study.description}</p>}

        {total > 0 && (
          <div className="flex items-center gap-3 mt-1">
            <div className="flex-1">
              <ProgressBar completed={completed} total={total} />
            </div>
            <span className="font-sans text-xs text-moss whitespace-nowrap">
              {completed}/{total} {unit}
            </span>
          </div>
        )}
        {sampleOnly && lockedCount > 0 && (
          <p className="flex items-center gap-1.5 font-sans text-xs text-moss">
            <LockIcon className="w-3.5 h-3.5 shrink-0" />
            {lockedLessonNote(`${lockedCount} more ${lessonNoun}`, { plural: lockedCount !== 1 })}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 mt-auto pt-2">
          <Link
            href={resumeHref}
            className="inline-flex items-center justify-center bg-ink text-parchment rounded-lg px-4 py-2 text-sm font-medium min-h-[40px]"
          >
            {completed === 0 ? "Start" : completed >= total && total > 0 ? "Review" : "Continue"}
          </Link>
          {showRestart && <RestartStudyButton studyId={study.id} studyTitle={study.title} />}
        </div>
      </div>
    </div>
  );
}
