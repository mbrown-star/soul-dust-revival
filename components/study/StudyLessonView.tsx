"use client";

import { useState } from "react";
import Link from "next/link";
import type { StudyWeekContent } from "@/lib/study/studyContent";
import { StudyTab } from "./study-tabs/StudyTab";
import { PassageTab } from "./study-tabs/PassageTab";
import { WorkTheWordTab } from "./study-tabs/WorkTheWordTab";
import { LiveItTab } from "./study-tabs/LiveItTab";
import { LiftUpTab } from "./study-tabs/LiftUpTab";
import { GreekSheet } from "./GreekSheet";

const TABS = [
  { key: "study", label: "Study" },
  { key: "passage", label: "Passage" },
  { key: "work", label: "Work the Word" },
  { key: "live", label: "Live It" },
  { key: "lift", label: "Lift Up" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * The 5-tab interactive Study reader (Study / Passage / Work the Word /
 * Live It / Lift Up), following the printed order of each week -- see
 * soul-dust-interactive/HANDOFF.md section 2 for the full design this is
 * built from. Renders only when the lesson has studyContent (see
 * lib/study/studyContent.ts); a Study-kind lesson without it (the
 * "Introduction" lesson, or any lesson imported before this existed) falls
 * back to the plain content-block reading view in the lesson page.
 */
export function StudyLessonView({
  lessonId,
  lessonTitle,
  content,
  initialAnswers,
  previousHref,
  nextHref,
}: {
  lessonId: string;
  lessonTitle: string;
  content: StudyWeekContent;
  initialAnswers: Record<string, string>;
  previousHref: string | null;
  nextHref: string | null;
}) {
  const [tab, setTab] = useState<TabKey>("study");
  const [greekStationRef, setGreekStationRef] = useState<string | null>(null);

  const greekStation = content.stations.find((s) => s.ref === greekStationRef) ?? null;

  function goToStation(stationRef: string) {
    setGreekStationRef(null);
    setTab("work");
    requestAnimationFrame(() => {
      document.getElementById(`station-${stationRef}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        {previousHref ? (
          <Link
            href={previousHref}
            aria-label="Previous week"
            className="flex items-center justify-center w-11 h-11 rounded-full border border-moss/30 hover:border-moss/60 shrink-0"
          >
            ←
          </Link>
        ) : (
          <span className="w-11 h-11 shrink-0" aria-hidden="true" />
        )}
        <div className="text-center">
          <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700">{lessonTitle}</p>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">{content.subtitle}</h1>
        </div>
        {nextHref ? (
          <Link
            href={nextHref}
            aria-label="Next week"
            className="flex items-center justify-center w-11 h-11 rounded-full border border-moss/30 hover:border-moss/60 shrink-0"
          >
            →
          </Link>
        ) : (
          <span className="w-11 h-11 shrink-0" aria-hidden="true" />
        )}
      </div>

      <div
        role="tablist"
        aria-label="Week sections"
        className="no-scrollbar flex gap-1 overflow-x-auto border-b border-dusk/10 pb-px"
        style={{ scrollbarWidth: "none" }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 px-4 py-3 text-sm font-sans font-semibold border-b-2 -mb-px whitespace-nowrap min-h-[44px] ${
              tab === t.key ? "border-ember text-ink" : "border-transparent text-moss hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "study" && <StudyTab lessonId={lessonId} content={content} />}
        {tab === "passage" && <PassageTab content={content} onOpenGreek={setGreekStationRef} />}
        {tab === "work" && <WorkTheWordTab content={content} initialAnswers={initialAnswers} />}
        {tab === "live" && <LiveItTab lessonId={lessonId} content={content} />}
        {tab === "lift" && <LiftUpTab content={content} />}
      </div>

      {greekStation && (
        <GreekSheet
          station={greekStation}
          onClose={() => setGreekStationRef(null)}
          onGoToStation={() => goToStation(greekStation.ref)}
        />
      )}
    </div>
  );
}
