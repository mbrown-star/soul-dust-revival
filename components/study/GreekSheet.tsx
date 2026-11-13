"use client";

import { type StudyStation, wordStudyHeadword, wordStudyLanguage } from "@/lib/study/studyContent";
import { Sheet } from "./Sheet";

/**
 * Bottom sheet opened by tapping an underlined word in the Passage tab (see
 * PassageTab's anchor rendering) -- shows the Greek word study behind that
 * English word and links back to the matching station's question in Work
 * the Word.
 */
export function GreekSheet({
  station,
  onClose,
  onGoToStation,
}: {
  station: StudyStation;
  onClose: () => void;
  onGoToStation: () => void;
}) {
  return (
    <Sheet label={`${wordStudyLanguage(station)} word study: ${wordStudyHeadword(station)}`} onClose={onClose}>
      <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700">
        The {wordStudyLanguage(station)} · {station.ref}
      </p>
      <p className="font-serif text-2xl text-ink">
        {station.greek ? (
          <>
            {station.greek} <span className="text-moss text-lg">({station.translit})</span>
          </>
        ) : (
          <span className="italic">{station.translit}</span>
        )}
      </p>
      <p className="font-serif text-ink">{station.gloss}</p>
      {station.body.map((p, i) => (
        <p key={i} className="font-serif text-ink">
          {p}
        </p>
      ))}
      <p className="font-sans text-xs text-moss">{station.xref}</p>
      <button
        type="button"
        onClick={onGoToStation}
        className="mt-2 inline-flex items-center justify-center min-h-[44px] px-4 rounded-full bg-ink text-parchment text-sm font-sans font-semibold"
      >
        Go to this question
      </button>
    </Sheet>
  );
}
