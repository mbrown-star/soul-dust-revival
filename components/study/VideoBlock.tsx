"use client";

import { useEffect, useState } from "react";

export function VideoBlock({
  contentBlockId,
  captionsUrl,
  transcript,
}: {
  contentBlockId: string;
  captionsUrl: string | null;
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

  if (!url) return <div className="aspect-video bg-moss/10 animate-pulse rounded-lg" aria-hidden="true" />;

  return (
    <div>
      <div className="aspect-video w-full">
        <video controls className="w-full h-full rounded-lg bg-black">
          <source src={url} type="application/x-mpegURL" />
          {/* Captions track (WCAG 1.2.2) — required in the admin UI whenever a
              video is uploaded; falls back gracefully if genuinely absent. */}
          {captionsUrl && <track kind="captions" src={captionsUrl} srcLang="en" label="English" default />}
          Your browser doesn&apos;t support embedded video.{" "}
          {transcript && "A transcript is available below."}
        </video>
      </div>

      {/* Transcript as a native disclosure widget — keyboard-operable and
          screen-reader-friendly with no custom ARIA required (WCAG 1.2.1). */}
      {transcript && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium">View transcript</summary>
          <p className="mt-2 text-sm whitespace-pre-wrap text-moss">{transcript}</p>
        </details>
      )}
    </div>
  );
}
