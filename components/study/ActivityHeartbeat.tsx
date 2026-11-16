"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const PING_INTERVAL_MS = 60_000; // once a minute is enough granularity for session-length reporting

function send(path: string, resume: boolean) {
  fetch("/api/activity/ping", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, resume }),
    // So the ping sent as a page is left or a tab closes still arrives.
    keepalive: true,
  }).catch(() => {
    // Best-effort: a failed heartbeat just means slightly less precise
    // reporting, never something to surface to the user.
  });
}

/**
 * Mount once per signed-in layout (website, reading app, Leader Resources,
 * admin). Logs time against the current page (see /api/activity/ping):
 *
 * - while the tab is visible, a ping every PING_INTERVAL_MS adds the time
 *   since the last one;
 * - leaving a page (in-app navigation or unmount), hiding the tab or closing
 *   it sends one more, so the last stretch is counted against that page;
 * - starting to track again (first load, tab visible again) sends a `resume`
 *   ping, which adds nothing, since the time before it was spent away.
 *
 * A backgrounded tab never pings, so it never inflates the time.
 */
export function ActivityHeartbeat() {
  const pathname = usePathname();
  // Whether this tab has been counting time up to now, so a page change
  // carries on rather than resuming (and the gap goes to the old page).
  const tracking = useRef(false);

  useEffect(() => {
    const visible = () => document.visibilityState === "visible";

    if (visible()) {
      send(pathname, !tracking.current);
      tracking.current = true;
    }

    const interval = setInterval(() => {
      if (visible()) send(pathname, false);
    }, PING_INTERVAL_MS);

    function onVisibilityChange() {
      if (visible()) {
        send(pathname, true);
        tracking.current = true;
      } else if (tracking.current) {
        send(pathname, false);
        tracking.current = false;
      }
    }

    function onPageHide() {
      if (tracking.current) {
        send(pathname, false);
        tracking.current = false;
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      // Leaving this page: count the last stretch against it.
      if (tracking.current && visible()) send(pathname, false);
    };
  }, [pathname]);

  return null;
}
