"use client";

import Link from "next/link";
import { readTabProgressPercent } from "./useStudyProgress";
import { Sheet } from "./Sheet";
import { LockIcon } from "./LockIcon";
import { lockedLessonNote } from "@/lib/launchMode";

export type WeekPickerItem = {
  id: string;
  title: string;
  href: string;
  isCurrent: boolean;
  /** Past the free sample for a reader who hasn't bought the study, or a Journey stop not open yet. */
  locked?: boolean;
  /** Why it's locked; defaults to the free-sample note. */
  lockedNote?: string;
  /** A section heading shown above the first item of each group (a Journey's Parts). */
  group?: string;
};

/**
 * Opened from the lesson header's breadcrumb -- lets a reader jump straight
 * to any week in the study, each row showing that week's own saved progress
 * (read from its own localStorage key, not this week's).
 */
export function WeekPickerSheet({
  bookLabel,
  weeks,
  heading,
  onClose,
}: {
  bookLabel: string;
  weeks: WeekPickerItem[];
  /** Defaults to "{bookLabel} · N Weeks". */
  heading?: string;
  onClose: () => void;
}) {
  return (
    <Sheet label={`${bookLabel} · Choose a week`} onClose={onClose}>
      <h2 className="font-display font-bold text-lg text-ink pr-8">
        {heading ?? `${bookLabel} · ${weeks.length} ${weeks.length === 1 ? "Week" : "Weeks"}`}
      </h2>
      <div className="divide-y divide-dusk/10">
        {weeks.map((week, i) => {
          const groupHeading =
            week.group && week.group !== weeks[i - 1]?.group ? (
              <p
                key={`group-${week.id}`}
                className="pt-5 pb-2 font-sans text-xs font-semibold uppercase tracking-wide text-ember-700"
              >
                {week.group}
              </p>
            ) : null;
          return [groupHeading, renderWeek(week, i)];
        })}
      </div>
    </Sheet>
  );

  function renderWeek(week: WeekPickerItem, i: number) {
    if (week.locked) {
      // Past the free sample: listed so the reader sees what's coming,
      // but not a link.
      return (
        <div key={week.id} className="flex items-center gap-4 py-3 min-h-[44px] text-moss">
          <span className="shrink-0 w-9 h-9 rounded-full border border-dusk/15 flex items-center justify-center">
            <LockIcon />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-sans font-semibold text-ink/60 truncate">{week.title}</span>
            <span className="block font-sans text-xs">{week.lockedNote ?? lockedLessonNote()}</span>
          </span>
        </div>
      );
    }
    const percent = readTabProgressPercent(week.id);
    return (
      <Link key={week.id} href={week.href} onClick={onClose} className="flex items-center gap-4 py-3 min-h-[44px]">
        <span
          className={`shrink-0 w-9 h-9 rounded-full border flex items-center justify-center text-xs font-sans font-bold tabular-nums ${
            week.isCurrent ? "border-ember text-ember-700" : "border-dusk/20 text-moss"
          }`}
        >
          {i + 1}
        </span>
        <span className="flex-1 min-w-0 font-sans font-semibold text-ink truncate">{week.title}</span>
        {percent > 0 && <span className="shrink-0 font-sans text-xs font-bold text-moss tabular-nums">{percent}%</span>}
      </Link>
    );
  }
}
