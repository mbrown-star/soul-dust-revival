"use client";

import Link from "next/link";
import { readTabProgressPercent } from "./useStudyProgress";
import { Sheet } from "./Sheet";

export type WeekPickerItem = {
  id: string;
  title: string;
  href: string;
  isCurrent: boolean;
};

/**
 * Opened from the lesson header's breadcrumb -- lets a reader jump straight
 * to any week in the study, each row showing that week's own saved progress
 * (read from its own localStorage key, not this week's).
 */
export function WeekPickerSheet({
  bookLabel,
  weeks,
  onClose,
}: {
  bookLabel: string;
  weeks: WeekPickerItem[];
  onClose: () => void;
}) {
  return (
    <Sheet label={`${bookLabel} · Choose a week`} onClose={onClose}>
      <h2 className="font-display font-bold text-lg text-ink pr-8">
        {bookLabel} · {weeks.length} {weeks.length === 1 ? "Week" : "Weeks"}
      </h2>
      <div className="divide-y divide-dusk/10">
        {weeks.map((week, i) => {
          const percent = readTabProgressPercent(week.id);
          return (
            <Link
              key={week.id}
              href={week.href}
              onClick={onClose}
              className="flex items-center gap-4 py-3 min-h-[44px]"
            >
              <span
                className={`shrink-0 w-9 h-9 rounded-full border flex items-center justify-center text-xs font-sans font-bold tabular-nums ${
                  week.isCurrent ? "border-ember text-ember-700" : "border-dusk/20 text-moss"
                }`}
              >
                {i + 1}
              </span>
              <span className="flex-1 min-w-0 font-sans font-semibold text-ink truncate">{week.title}</span>
              {percent > 0 && (
                <span className="shrink-0 font-sans text-xs font-bold text-moss tabular-nums">{percent}%</span>
              )}
            </Link>
          );
        })}
      </div>
    </Sheet>
  );
}
