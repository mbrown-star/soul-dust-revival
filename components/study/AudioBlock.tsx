"use client";

import { useEffect, useState } from "react";
import type { StreamSignRequest } from "./streamSign";

export function AudioBlock({
  sign,
  mediaUrl,
  transcript,
}: {
  /** What to ask /api/stream/sign-url for, when the source is an upload. */
  sign: StreamSignRequest;
  /** A linked (not uploaded) source -- played directly, no signed URL needed. */
  mediaUrl: string | null;
  transcript: string | null;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // A string, so the effect re-runs only when the request actually changes
  // (callers pass a fresh object on every render).
  const signKey = JSON.stringify(sign);
  const url = mediaUrl ?? signedUrl;

  useEffect(() => {
    if (mediaUrl) return;
    fetch("/api/stream/sign-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: signKey,
    })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as { url?: string };
        if (!r.ok || !data.url) throw new Error("sign failed");
        setSignedUrl(data.url);
      })
      .catch(() => setFailed(true));
  }, [signKey, mediaUrl]);

  if (!url && failed) {
    return (
      <p role="status" className="rounded-lg bg-moss/10 p-4 text-sm text-moss">
        This audio couldn&apos;t load. Reload the page to try again.
      </p>
    );
  }
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
