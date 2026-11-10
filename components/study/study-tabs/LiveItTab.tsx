"use client";

import type { StudyWeekContent } from "@/lib/study/studyContent";
import { useLocalProgress } from "../useLocalProgress";
import { PrayerTimer } from "../PrayerTimer";
import { WeekMediaSlot } from "../WeekMediaSlot";

export function LiveItTab({
  lessonId,
  weekLabel,
  content,
  isDone,
  onSetDone,
}: {
  lessonId: string;
  weekLabel: string;
  content: StudyWeekContent;
  isDone: boolean;
  onSetDone: (done: boolean) => void;
}) {
  const [completed, togglePractice] = useLocalProgress(`sdr-study-practices-${lessonId}`);

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700">
          Life Application · {weekLabel}
        </p>
        <h2 className="font-display font-bold text-xl text-ink mt-0.5">{content.lifeTitle}</h2>
        <p className="font-serif text-ink mt-2">{content.lifeIntro}</p>
      </div>

      <ul className="space-y-3">
        {content.practices.map((practice, i) => {
          const isDone = completed.has(i);
          return (
            <li key={practice.n} className="border border-dusk/10 rounded-xl p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={() => togglePractice(i)}
                  className="mt-1 w-5 h-5 accent-ink shrink-0"
                />
                <span>
                  <span className={`font-sans font-semibold block ${isDone ? "line-through text-moss" : "text-ink"}`}>
                    {practice.n}. {practice.title}
                  </span>
                  <span className="font-serif text-ink block mt-1">{practice.body}</span>
                </span>
              </label>
              <WeekMediaSlot slot={`practice:${i}`} className="mt-4" />
            </li>
          );
        })}
      </ul>

      {(content.prayerLead || content.prayerBeats.length > 0 || content.prayerClose) && (
        <PrayerTimer lead={content.prayerLead} beats={content.prayerBeats} close={content.prayerClose} />
      )}

      {content.bottomLine.length > 0 && (
        <div className="bg-dusk/5 border-l-4 border-ember rounded-r-xl p-5 space-y-3">
          {/* FIXED (axe-core, qa/e2e/specs/accessibility.spec.ts): text-ember-700
              at this size was 4.47:1 against the real bg-dusk/5 composited
              background, under WCAG AA's 4.5:1 -- ember-700 only clears AA on
              a full-strength parchment/white background (4.9-5.0:1), not this
              diluted tint. moss clears it comfortably here. */}
          <p className="font-sans text-xs font-semibold uppercase tracking-wide text-moss">Bottom Line</p>
          {content.bottomLine.map((p, i) => (
            <p key={i} className="font-serif text-ink">
              {p}
            </p>
          ))}
        </div>
      )}

      <WeekMediaSlot slot="tab:live" />

      <button
        type="button"
        onClick={() => onSetDone(!isDone)}
        className={`w-full min-h-[44px] rounded-full font-sans font-semibold text-sm ${
          isDone ? "bg-moss text-white" : "bg-ink text-parchment"
        }`}
      >
        {isDone ? "✓ Living it this week" : "Living it this week"}
      </button>
    </div>
  );
}
