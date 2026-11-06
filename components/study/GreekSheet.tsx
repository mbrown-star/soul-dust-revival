"use client";

import type { StudyStation } from "@/lib/study/studyContent";

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Greek word study: ${station.greek}`}
        className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] overflow-y-auto p-6 space-y-3"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center text-moss text-lg"
        >
          ✕
        </button>
        <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700">{station.ref}</p>
        <p className="font-serif text-2xl text-ink">
          {station.greek} <span className="text-moss text-lg">({station.translit})</span>
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
      </div>
    </div>
  );
}
