import Link from "next/link";
import { LockIcon } from "@/components/study/LockIcon";

/** End of a Journey stop whose next stop isn't open yet. */
export function JourneyNextStopNote({ note, homeHref }: { note: string; homeHref: string }) {
  return (
    <div className="flex flex-wrap items-center gap-4 bg-dusk/5 border border-dusk/10 rounded-lg p-5">
      <span className="shrink-0 w-10 h-10 rounded-full border border-dusk/15 flex items-center justify-center text-moss">
        <LockIcon />
      </span>
      <p className="min-w-0 flex-1 font-sans font-semibold text-ink">{note}</p>
      <Link
        href={homeHref}
        className="shrink-0 border border-moss/30 rounded-lg px-4 py-2 min-h-[44px] flex items-center font-sans text-sm font-medium hover:border-moss/60"
      >
        The Journey
      </Link>
    </div>
  );
}
