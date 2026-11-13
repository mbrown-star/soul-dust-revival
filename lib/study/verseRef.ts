import { formatReadings } from "@/lib/devotional/parseDayLabel";

/**
 * A week's key verse reference for readers. Loaded studies store it as
 * printed, "NUMBERS 6:24–26 · WEB": readers see "Numbers 6:24–26", in
 * ordinary case without the translation tag (staging audit, 2026-11-13).
 */
export function displayVerseRef(ref: string): string {
  const withoutTag = ref.replace(/\s*(?:·|\()\s*(?:WEB|NKJV|NASB|ESV|KJV)\)?\s*$/i, "").trim();
  return /[a-z]/.test(withoutTag) ? withoutTag : formatReadings(withoutTag);
}
