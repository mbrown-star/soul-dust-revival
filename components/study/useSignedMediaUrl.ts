"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StreamSignRequest } from "./streamSign";

/**
 * The URL a video/audio player should play from.
 *
 * A linked file plays from its own URL. An uploaded (Stream) file needs a
 * signed URL that expires after an hour, so it's requested only once the
 * player is actually on screen -- a player inside a tab the reader hasn't
 * opened yet (rendered but hidden) waits instead of signing at page load and
 * expiring before anyone presses play. If playback still fails later (the
 * page was left open past the hour), `onPlaybackError` re-signs once.
 */
export function useSignedMediaUrl(sign: StreamSignRequest, mediaUrl: string | null) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const resignedRef = useRef(false);
  // A string, so effects re-run only when the request actually changes
  // (callers pass a fresh object on every render).
  const signKey = JSON.stringify(sign);

  useEffect(() => {
    if (mediaUrl || visible) return;
    const el = containerRef.current;
    if (!el) return;
    // The margin signs a little before the player scrolls into view, so it's
    // ready by the time the reader gets there. A player in a hidden tab
    // never intersects until that tab is shown.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "800px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mediaUrl, visible]);

  useEffect(() => {
    if (mediaUrl || !visible) return;
    let cancelled = false;
    // On an admin's "preview unpublished changes" page (?draft=1), ask for
    // the draft's media; the server ignores this for anyone but an admin.
    const draft = new URLSearchParams(window.location.search).get("draft") === "1";
    fetch("/api/stream/sign-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: draft ? JSON.stringify({ ...(JSON.parse(signKey) as StreamSignRequest), draft: true }) : signKey,
    })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as { url?: string };
        if (!r.ok || !data.url) throw new Error("sign failed");
        if (!cancelled) setSignedUrl(data.url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [signKey, mediaUrl, visible, attempt]);

  const onPlaybackError = useCallback(() => {
    if (mediaUrl || resignedRef.current) return;
    resignedRef.current = true;
    setSignedUrl(null);
    setAttempt((n) => n + 1);
  }, [mediaUrl]);

  return { containerRef, url: mediaUrl ?? signedUrl, failed, onPlaybackError };
}
