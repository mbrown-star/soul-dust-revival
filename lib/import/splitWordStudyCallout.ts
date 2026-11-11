/**
 * Repairs a word-study callout imported before the parser knew where a word
 * study ends (see LIVE_IT_LINE / LIFE_APPLICATION_HEADING in
 * splitIntoLessons.ts): everything after the study's "LIVE IT" line -- the
 * week's Life Application, Daily Prayer, Bottom Line, Benediction, and in
 * some weeks a Movement or Part closing -- was stored inside the callout.
 *
 * Splits the callout's HTML into the word study and the rest, at the same
 * boundary the parser now uses: right after the last "LIVE IT" paragraph
 * before the LIFE APPLICATION heading ("LIVE IT …" inline, or a bold
 * "LIVEIT" label followed by its one paragraph), else at the heading itself.
 * Returns null when there's nothing to split or the HTML isn't the plain
 * `<p>` sequence the importer writes (so it's never guessed at).
 */
const LIFE_APPLICATION = /LIFE ?APPLICATION\b/;
const LIVE_IT_LABEL_ONLY = /^<strong>\s*LIVE ?IT:?\s*<\/strong>$/;
const LIVE_IT_INLINE = /^(?:<strong>\s*)?LIVE ?IT\b/;

export function splitWordStudyCallout(body: string): { callout: string; rest: string } | null {
  const paragraphs = body.match(/<p>[\s\S]*?<\/p>/g);
  if (!paragraphs) return null;
  // Only the importer's own shape: <p> elements separated by whitespace.
  if (body.replace(/<p>[\s\S]*?<\/p>/g, "").trim() !== "") return null;

  const inner = paragraphs.map((p) => p.slice(3, -4).trim());
  const heading = inner.findIndex((p) => LIFE_APPLICATION.test(p));
  if (heading <= 0) return null;

  let cut = heading;
  for (let i = heading - 1; i >= 0; i--) {
    if (LIVE_IT_LABEL_ONLY.test(inner[i]!)) {
      if (i + 2 <= heading) cut = i + 2;
      break;
    }
    if (LIVE_IT_INLINE.test(inner[i]!)) {
      cut = i + 1;
      break;
    }
  }

  const callout = paragraphs.slice(0, cut).join("\n");
  const rest = paragraphs.slice(cut).join("\n");
  return callout && rest ? { callout, rest } : null;
}
