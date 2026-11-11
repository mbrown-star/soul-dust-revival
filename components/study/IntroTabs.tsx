"use client";

import { useId, useState, type ReactNode } from "react";
import { ScrollFadeTabs } from "@/components/ui/ScrollFadeTabs";

/**
 * An introduction (a study's, a devotional's, or a Journey threshold's), one
 * tab per section (Foreword, Preface, …; see lib/study/introSections.ts). Every panel stays mounted and is only
 * hidden, like the Study reader's tabs.
 */
export function IntroTabs({ sections }: { sections: { title: string; content: ReactNode }[] }) {
  const id = useId();
  const [current, setCurrent] = useState(0);

  return (
    <div className="space-y-6">
      <ScrollFadeTabs ariaLabel="Introduction sections">
        {sections.map((section, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={current === i}
            aria-controls={`${id}-panel-${i}`}
            onClick={() => setCurrent(i)}
            className={`shrink-0 px-4 py-3 text-sm font-sans font-semibold border-b-2 -mb-px whitespace-nowrap min-h-[44px] ${
              current === i ? "border-ember text-ink" : "border-transparent text-moss hover:text-ink"
            }`}
          >
            {section.title}
          </button>
        ))}
      </ScrollFadeTabs>
      {sections.map((section, i) => (
        <div
          key={i}
          role="tabpanel"
          id={`${id}-panel-${i}`}
          aria-labelledby={`${id}-tab-${i}`}
          hidden={current !== i}
        >
          {section.content}
          {i < sections.length - 1 && (
            <button
              type="button"
              onClick={() => {
                setCurrent(i + 1);
                document.getElementById(`${id}-tab-${i + 1}`)?.scrollIntoView({ block: "nearest" });
              }}
              className="mt-8 font-sans font-semibold text-sm text-moss hover:text-ink underline underline-offset-2"
            >
              Next: {sections[i + 1]!.title} →
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
