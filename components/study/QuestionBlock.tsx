"use client";

import { useState, useId } from "react";

export function QuestionBlock({
  contentBlockId,
  prompt,
  initialAnswer,
  onSaved,
}: {
  contentBlockId: string;
  prompt: string;
  initialAnswer?: string;
  /** Fired with the current answer text after a successful save -- lets a
   * caller (e.g. the Study reader's Work the Word stepper) track which
   * stations have been answered without this component needing to know why. */
  onSaved?: (answerText: string) => void;
}) {
  const [answer, setAnswer] = useState(initialAnswer ?? "");
  const [saved, setSaved] = useState(false);
  const questionId = useId();

  async function save() {
    await fetch("/api/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentBlockId, answerText: answer }),
    });
    setSaved(true);
    onSaved?.(answer);
  }

  return (
    <div className="space-y-2">
      <label htmlFor={questionId} className="font-medium block">{prompt}</label>
      <textarea
        id={questionId}
        className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
        value={answer}
        onChange={(e) => {
          setAnswer(e.target.value);
          setSaved(false);
        }}
        onBlur={save}
        rows={4}
      />
      {/* Announced to screen readers as it appears, not just visually shown
          (WCAG 4.1.3 Status Messages) — a sighted mouse user sees "Saved"
          appear, but that's silent to a screen reader without this. */}
      <p role="status" aria-live="polite" className="text-sm text-moss h-5">
        {saved ? "Saved" : ""}
      </p>
    </div>
  );
}
