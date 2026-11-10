import Link from "next/link";
import { LockIcon } from "./LockIcon";
import { lockedLessonNote } from "@/lib/launchMode";

/**
 * Shown at the end of the last lesson a free-sample reader can open, in place
 * of a link to the next one: "Week 4 unlocks at launch and purchase". On the
 * full site it also links to the product page, where the study can be bought.
 */
export function LockedNextLesson({
  label,
  productHref,
  kindLabel,
  endOfSample,
}: {
  label: string;
  productHref: string | null;
  /** "study" or "devotional", for the button: "Get the full devotional". */
  kindLabel: string;
  /** False when a later lesson in the study is still open to this reader. */
  endOfSample: boolean;
}) {
  return (
    <div className="flex items-center gap-4 bg-dusk/5 border border-dusk/10 rounded-lg p-5">
      <span className="shrink-0 w-10 h-10 rounded-full border border-dusk/15 flex items-center justify-center text-moss">
        <LockIcon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-sans font-semibold text-ink">{lockedLessonNote(label)}</p>
        <p className="font-serif text-sm text-moss">
          {endOfSample
            ? "That's the end of the free sample."
            : "More of the free sample is further on — find it in the table of contents."}
        </p>
      </div>
      {productHref && (
        <Link
          href={productHref}
          className="shrink-0 bg-ink text-parchment rounded-lg px-4 py-2 min-h-[44px] flex items-center font-sans text-sm font-medium"
        >
          Get the full {kindLabel}
        </Link>
      )}
    </div>
  );
}
