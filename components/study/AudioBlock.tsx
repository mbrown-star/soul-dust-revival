"use client";

import { useEffect, useState } from "react";

export function AudioBlock({
  contentBlockId,
  mediaUrl,
  transcript,
}: {
  contentBlockId: string;
  /** A linked (not uploaded) source -- played directly, no signed URL needed. */
  mediaUrl: string | null;
  transcript: string | null;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const url = mediaUrl ?? signedUrl;

  useEffect(() => {
    if (mediaUrl) return;
    fetch("/api/stream/sign-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentBlockId }),
    })
      .then((r) => r.json())
      .then((data) => setSignedUrl((data as { url: string }).url));
  }, [contentBlockId, mediaUrl]);

  if (!url) return <div className="h-12 bg-moss/10 animate-pulse rounded-lg" aria-hidden="true" />;

  return (
    <div>
      <audio controls className="w-full" src={url} />
      {/* Audio has no visual captions track, so a transcript is the primary
          accessible alternative (WCAG 1.2.1) — required in the admin UI. */}
      {transcript ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium">View transcript</summary>
          <p className="mt-2 text-sm whitespace-pre-wrap text-moss">{transcript}</p>
        </details>
      ) : (
        <p className="mt-2 text-sm text-gold-700">Transcript not yet available for this audio.</p>
      )}
    </div>
  );
}
