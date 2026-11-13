import { htmlToPlainText } from "@/lib/content/plainText";
import { startsWithBareCitation } from "@/lib/import/bareCitation";

export type ParsedDevotionalDay = {
  title: string;
  /** The day's readings, when the day opens with them (A 365-Day Journey
   * Through the Bible: "GENESIS 1–2 · MATTHEW 1:1–12 · PSALM 1"). */
  readings: string | null;
  keyVerseQuote: string | null;
  keyVerseCitation: string | null;
  bodyParagraphs: string[];
  liftUpParagraphs: string[];
  questionParagraphs: string[];
  /** The closing prayer and its printed heading ("A Prayer", "A Prayer to Begin"). */
  prayerHeading: string | null;
  prayerParagraphs: string[];
};

// Same shape the importer recognizes (lib/import/splitIntoLessons.ts):
// capitals and chapter numbers, no lower-case letters.
// Never a day's own label ("DAY 1 · JANUARY 1 · PSALM 1").
const READINGS_HEADING = /^(?!DAY\s*\d)(?=.*\d)(?=.*[A-Z]{3})[^a-z]{6,160}$/;

export function isReadingsLine(line: string): boolean {
  return READINGS_HEADING.test(line);
}

const HEADING_PARAGRAPH = /^<p><strong>(.*?)<\/strong><\/p>$/;
const PLAIN_PARAGRAPH = /^<p>(.*)<\/p>$/;

/**
 * Splits a devotional lesson's single stored text block (sanitized HTML from
 * lib/import/splitIntoLessons.ts's paragraphsToHtml) back into its printed
 * parts, so the reader can give each one its own treatment (a key-verse
 * card, a styled "Lift Up Your Eyes" callout, ...) instead of one plain
 * scroll of paragraphs. Works entirely at render time against the HTML
 * already stored for every existing lesson -- no parser or schema change,
 * no re-import needed.
 *
 * Relies on the devotional PDF import's own consistent shape: a bolded
 * title line, a quoted key verse, a bolded citation, the day's reading
 * paragraphs, then bolded "LIFT UP YOUR EYES" and "A QUESTION TO SIT WITH"
 * headings each followed by their own paragraph(s). A lesson that doesn't
 * match this shape (hand-edited in the admin UI, for instance) still
 * renders correctly -- it just falls back into bodyParagraphs rather than
 * being split into named parts.
 */
export function parseDevotionalHtml(html: string): ParsedDevotionalDay {
  const paragraphs = normalizeBlockBoundaries(html)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const result: ParsedDevotionalDay = {
    title: "",
    readings: null,
    keyVerseQuote: null,
    keyVerseCitation: null,
    bodyParagraphs: [],
    liftUpParagraphs: [],
    questionParagraphs: [],
    prayerHeading: null,
    prayerParagraphs: [],
  };

  type Section = "title" | "keyVerse" | "citation" | "body" | "lift" | "question" | "prayer";
  let section: Section = "title";

  const isQuote = (text: string) => /^[“"]/.test(text);
  const isCitationHeading = (heading: string) => /^—?\s*[A-Z0-9]/.test(heading) && heading.length < 60;

  for (const paragraph of paragraphs) {
    const headingMatch = paragraph.match(HEADING_PARAGRAPH);
    const plainMatch = paragraph.match(PLAIN_PARAGRAPH);

    if (headingMatch) {
      const heading = htmlToPlainText(headingMatch[1]);
      const normalized = heading.replace(/[^a-zA-Z]/g, "").toUpperCase();

      if (section === "title" && result.title === "" && result.readings === null && READINGS_HEADING.test(heading)) {
        result.readings = heading;
        continue;
      }
      if (section === "title" && result.title === "") {
        result.title = heading;
        // A day that opens with its readings has no key verse: its first
        // paragraph can start with a quotation and is still body text.
        section = result.readings ? "body" : "keyVerse";
        continue;
      }
      if (normalized === "LIFTUPYOUREYES") {
        section = "lift";
        continue;
      }
      if (normalized.startsWith("AQUESTIONTOSITWITH") || normalized === "QUESTIONTOSITWITH") {
        section = "question";
        continue;
      }
      if (normalized.startsWith("APRAYER")) {
        result.prayerHeading = toTitleCase(heading);
        section = "prayer";
        continue;
      }
      if (section === "citation" || (section === "keyVerse" && isCitationHeading(heading))) {
        result.keyVerseCitation = heading;
        section = "body";
        continue;
      }
      // An unrecognized heading mid-document -- keep it visible rather than
      // silently dropping it, folded into whatever section is currently active.
      pushToSection(result, section, heading);
      continue;
    }

    if (plainMatch) {
      const text = htmlToPlainText(plainMatch[1]);
      if (section === "keyVerse" && isQuote(text)) {
        result.keyVerseQuote = text;
        section = "citation";
        continue;
      }
      // Tolerates a citation stored as a plain paragraph rather than a
      // bolded heading (older imports, from before the parser reliably
      // recognized a short, non-letter-only line like "— PSALM 1:3" as
      // heading-shaped) -- re-imported lessons always produce the bolded
      // form, but this keeps an unreprocessed lesson from showing its
      // citation glued onto the start of the first body paragraph.
      if (section === "citation" && isCitationHeading(text)) {
        result.keyVerseCitation = text;
        section = "body";
        continue;
      }
      if (section === "keyVerse" || section === "citation") {
        // No quote/citation found where one was expected -- this day
        // doesn't follow the usual shape, so treat it as body text instead
        // of losing it.
        section = "body";
      }
      pushToSection(result, section, text);
    }
  }

  return result;
}

// The importer writes one paragraph per line, but the admin's rich-text
// editor serializes HTML with no newlines and writes headings as <h2> --
// without this, editing a day in the admin collapsed the whole day into one
// unparsed paragraph on the reader.
function normalizeBlockBoundaries(html: string): string {
  return (
    html
      .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, "<p><strong>$1</strong></p>")
      // List items and quotes become their own paragraphs (the reader shows
      // plain paragraphs), rather than being dropped as unrecognized lines.
      .replace(/<li[^>]*>/gi, "<p>")
      .replace(/<\/li>/gi, "</p>")
      .replace(/<\/?(ul|ol|blockquote)[^>]*>/gi, "")
      .replace(/<p>(\s*<p>)+/gi, "<p>")
      .replace(/<\/p>(\s*<\/p>)+/gi, "</p>")
      .replace(/<\/p>\s*(?=<)/gi, "</p>\n")
  );
}

// "A PRAYER TO BEGIN" -> "A Prayer to Begin".
function toTitleCase(heading: string): string {
  if (/[a-z]/.test(heading)) return heading;
  const small = new Set(["a", "an", "and", "the", "to", "of", "for", "in", "on", "with"]);
  return heading
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => (i > 0 && small.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

function pushToSection(
  result: ParsedDevotionalDay,
  section: "title" | "keyVerse" | "citation" | "body" | "lift" | "question" | "prayer",
  text: string
) {
  const list =
    section === "lift"
      ? result.liftUpParagraphs
      : section === "question"
        ? result.questionParagraphs
        : section === "prayer"
          ? result.prayerParagraphs
          : result.bodyParagraphs;
  // Days imported before the importer kept a quotation's citation with it
  // have "(Genesis 18:14). A year later…" as a paragraph of its own: join it
  // back onto the quotation it belongs to.
  const previous = list.length - 1;
  if (previous >= 0 && startsWithBareCitation(text)) list[previous] = `${list[previous]} ${text}`;
  else list.push(text);
}
