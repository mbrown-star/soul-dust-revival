"use client";

import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/** A date and time in the viewer's own time zone (UTC with the zone named until hydrated). */
export function LocalDateTime({ iso }: { iso: string }) {
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" };
  const text = useSyncExternalStore(
    noSubscribe,
    () => new Date(iso).toLocaleString(undefined, options),
    () => new Date(iso).toLocaleString("en-US", { ...options, timeZone: "UTC" })
  );
  return <time dateTime={iso}>{text}</time>;
}
