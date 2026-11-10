"use client";

import type { StreamSignRequest } from "./streamSign";
import { useSignedMediaUrl } from "./useSignedMediaUrl";

export function VideoBlock({
  sign,
  mediaUrl,
  captionsUrl,
  transcript,
}: {
  /** What to ask /api/stream/sign-url for, when the source is an upload. */
  sign: StreamSignRequest;
  /** A linked (not uploaded) source -- played directly, no signed URL needed. */
  mediaUrl: string | null;
  captionsUrl: string | null;
  transcript: string | null;
}) {
  const { containerRef, url, failed, onPlaybackError } = useSignedMediaUrl(sign, mediaUrl);

  if (!url && failed) {
    return (
      <p role="status" className="rounded-lg bg-moss/10 p-4 text-sm text-moss">
        This video couldn&apos;t load. Reload the page to try again.
      </p>
    );
  }
  if (!url) return <div ref={containerRef} className="aspect-video bg-moss/10 animate-pulse rounded-lg" aria-hidden="true" />;

  return (
    <div>
      <div className="aspect-video w-full">
        {/* Keyed on the URL so a re-signed URL (after the old one expired)
            actually reloads the player. */}
        <video key={url} controls className="w-full h-full rounded-lg bg-black">
          {/* An uploaded video is an HLS stream; a linked one is whatever file
              the admin pointed at, so the browser sniffs its type itself. */}
          {mediaUrl ? (
            <source src={url} />
          ) : (
            <source src={url} type="application/x-mpegURL" onError={onPlaybackError} />
          )}
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
