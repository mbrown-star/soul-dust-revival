"use client";

import { useState } from "react";
import Link from "next/link";
import { ScrollFadeTabs } from "@/components/ui/ScrollFadeTabs";

const RING_RADIUS = 16;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

type TabKey = "read" | "contents" | "journal";

/** "Soul Dust Revival: Revive Me - A Journey Out of the Dust" -> "Revive Me - A Journey Out of the Dust". */
function deriveBookTitle(title: string): string {
  const stripped = title.replace(/^soul dust revival:?\s*/i, "").trim();
  return stripped || title;
}

/**
 * The book reader's shell (study kind "book", e.g. Revive Me): Read (the
 * chapter), Contents (the Parts and chapters, with what's been read) and
 * Journal (every answer written to a chapter's "To Sit With" questions).
 * The panels are rendered on the server and passed in, so sanitized HTML
 * stays server-side; this component only switches between them. Panels stay
 * mounted when hidden, so a half-typed answer survives a look at Contents.
 */
export function BookAppView({
  title,
  studyHref,
  chaptersRead,
  totalChapters,
  read,
  contents,
  journal,
}: {
  title: string;
  studyHref: string;
  chaptersRead: number;
  totalChapters: number;
  read: React.ReactNode;
  contents: React.ReactNode;
  journal: React.ReactNode | null;
}) {
  const [tab, setTab] = useState<TabKey>("read");
  const tabs: { key: TabKey; label: string }[] = [
    { key: "read", label: "Read" },
    { key: "contents", label: "Contents" },
    ...(journal ? [{ key: "journal" as const, label: "Journal" }] : []),
  ];
  const percent = totalChapters > 0 ? Math.round((chaptersRead / totalChapters) * 100) : 0;

  return (
    <div className="space-y-6">
      <Link href={studyHref} className="inline-block text-sm text-moss hover:text-ink underline underline-offset-2">
        ← Back to table of contents
      </Link>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700">Soul Dust Revival · Book</p>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink mt-0.5">{deriveBookTitle(title)}</h1>
        </div>
        <div
          className="relative w-14 h-14 shrink-0"
          role="img"
          aria-label={`${chaptersRead} of ${totalChapters} chapters read`}
        >
          <svg viewBox="0 0 40 40" className="w-full h-full -rotate-90" aria-hidden="true">
            <circle cx="20" cy="20" r={RING_RADIUS} fill="none" strokeWidth="4" className="stroke-dusk/15" />
            <circle
              cx="20"
              cy="20"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              className="stroke-moss transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - percent / 100)}
            />
          </svg>
          <span
            aria-hidden="true"
            className="absolute inset-0 flex flex-col items-center justify-center font-sans font-bold text-ink tabular-nums leading-none"
          >
            <span className="text-sm">{chaptersRead}</span>
            <span className="text-[8px] tracking-wide text-moss font-semibold">OF {totalChapters}</span>
          </span>
        </div>
      </div>

      <ScrollFadeTabs ariaLabel="Book sections">
        {tabs.map((t) => (
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
      </ScrollFadeTabs>

      <div role="tabpanel" hidden={tab !== "read"}>
        {read}
      </div>
      <div role="tabpanel" hidden={tab !== "contents"}>
        {contents}
      </div>
      {journal && (
        <div role="tabpanel" hidden={tab !== "journal"}>
          {journal}
        </div>
      )}
    </div>
  );
}
