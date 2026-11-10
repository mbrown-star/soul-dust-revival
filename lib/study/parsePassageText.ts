import type { StudyWeekContent } from "./studyContent";

export type PassageVerse = StudyWeekContent["passage"][number];

const CHAPTER_AND_VERSE = /^(\d{1,3})\s*[:.]\s*(\d{1,3})\s+(.+)$/;
const VERSE_ONLY = /^(\d{1,3})\s+(.+)$/;

/**
 * Turns a pasted passage into verse rows. Each line may start with
 * "chapter:verse" ("1:3 text") or just a verse number ("3 text", which
 * stays in the current chapter); a line with no number continues the
 * previous verse. `startChapter` is the chapter assumed before the first
 * "chapter:verse" marker.
 */
export function parsePassageText(text: string, startChapter = 1): PassageVerse[] {
  const verses: PassageVerse[] = [];
  let chapter = startChapter;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const full = line.match(CHAPTER_AND_VERSE);
    if (full) {
      chapter = Number(full[1]);
      verses.push({ c: chapter, n: Number(full[2]), text: full[3]!.trim() });
      continue;
    }
    const verseOnly = line.match(VERSE_ONLY);
    if (verseOnly) {
      verses.push({ c: chapter, n: Number(verseOnly[1]), text: verseOnly[2]!.trim() });
      continue;
    }
    const last = verses.at(-1);
    if (last) last.text = `${last.text} ${line}`;
    else verses.push({ c: chapter, n: 1, text: line });
  }

  return verses.filter((v) => v.c >= 1 && v.n >= 1);
}
