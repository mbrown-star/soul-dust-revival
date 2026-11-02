"use client";

import { useEffect } from "react";

const PING_INTERVAL_MS = 60_000; // once a minute is enough granularity for session-length reporting

/**
 * Mount once per authenticated layout (study app, leader section). Pings
 * the activity endpoint on mount and then every PING_INTERVAL_MS, but only
 * while the tab is actually visible/focused — pinging a backgrounded tab
 * would inflate reported session length with time the person wasn't really
 * using the app.
 */
export function ActivityHeartbeat() {
  useEffect(() => {
    function ping() {
      if (document.visibilityState === "visible") {
        fetch("/api/activity/ping", { method: "POST" }).catch(() => {
          // Best-effort — a failed heartbeat just means slightly less
          // precise reporting, never something to surface to the user.
        });
      }
    }

    ping(); // record activity immediately on page load, not just after the first interval
    const interval = setInterval(ping, PING_INTERVAL_MS);

    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);

  return null;
}
