"use client";

import { useEffect, useState } from "react";

export function AudioBlock({
  contentBlockId,
  transcript,
}: {
  contentBlockId: string;
  transcript: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stream/sign-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentBlockId }),
    })
      .then((r) => r.json())
      .then((data) => setUrl((data as { url: string }).url));
  }, [contentBlockId]);

  if (!url) return <div className="h-12 bg-neutral-100 animate-pulse rounded-lg" aria-hidden="true" />;

  return (
    <div>
      <audio controls className="w-full" src={url} />
      {/* Audio has no visual captions track, so a transcript is the primary
          accessible alternative (WCAG 1.2.1) — required in the admin UI. */}
      {transcript ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium">View transcript</summary>
          <p className="mt-2 text-sm whitespace-pre-wrap text-neutral-700">{transcript}</p>
        </details>
      ) : (
        <p className="mt-2 text-sm text-amber-700">Transcript not yet available for this audio.</p>
      )}
    </div>
  );
}
