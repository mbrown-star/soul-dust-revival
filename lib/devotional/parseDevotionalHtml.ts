export type ParsedDevotionalDay = {
  title: string;
  keyVerseQuote: string | null;
  keyVerseCitation: string | null;
  bodyParagraphs: string[];
  liftUpParagraphs: string[];
  questionParagraphs: string[];
};

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
  const paragraphs = html
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const result: ParsedDevotionalDay = {
    title: "",
    keyVerseQuote: null,
    keyVerseCitation: null,
    bodyParagraphs: [],
    liftUpParagraphs: [],
    questionParagraphs: [],
  };

  type Section = "title" | "keyVerse" | "citation" | "body" | "lift" | "question";
  let section: Section = "title";

  const isQuote = (text: string) => /^[“"]/.test(text);
  const isCitationHeading = (heading: string) => /^—?\s*[A-Z0-9]/.test(heading) && heading.length < 60;

  for (const paragraph of paragraphs) {
    const headingMatch = paragraph.match(HEADING_PARAGRAPH);
    const plainMatch = paragraph.match(PLAIN_PARAGRAPH);

    if (headingMatch) {
      const heading = headingMatch[1] ?? "";
      const normalized = heading.replace(/[^a-zA-Z]/g, "").toUpperCase();

      if (section === "title" && result.title === "") {
        result.title = heading;
        section = "keyVerse";
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
      const text = plainMatch[1] ?? "";
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

function pushToSection(result: ParsedDevotionalDay, section: "title" | "keyVerse" | "citation" | "body" | "lift" | "question", text: string) {
  if (section === "lift") result.liftUpParagraphs.push(text);
  else if (section === "question") result.questionParagraphs.push(text);
  else result.bodyParagraphs.push(text);
}
