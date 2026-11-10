"use client";

import type { StreamSignRequest } from "./streamSign";
import { useSignedMediaUrl } from "./useSignedMediaUrl";

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
  const { containerRef, url, failed, onPlaybackError } = useSignedMediaUrl(sign, mediaUrl);

  if (!url && failed) {
    return (
      <p role="status" className="rounded-lg bg-moss/10 p-4 text-sm text-moss">
        This audio couldn&apos;t load. Reload the page to try again.
      </p>
    );
  }
  if (!url) return <div ref={containerRef} className="h-12 bg-moss/10 animate-pulse rounded-lg" aria-hidden="true" />;

  return (
    <div>
      <audio key={url} controls className="w-full" src={url} onError={mediaUrl ? undefined : onPlaybackError} />
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
