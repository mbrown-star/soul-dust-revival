/**
 * Repairs a study's or devotional's Introduction as imported from its
 * manuscript. The PDFs set headings in capitals, often letter-spaced, which
 * the importer ran together ("THEWEEKLYRHYTHM") and kept as bold
 * paragraphs. This turns the front matter into real structure, so the
 * reader can tab between its sections (lib/study/introSections.ts):
 *
 * - FOREWORD, PREFACE and a "HOW TO USE THIS STUDY" section become `<h2>`.
 * - Known sub-headings become `<h3>`/`<h4>` with their words back, spelled
 *   as the manuscripts print them.
 * - A section's subtitle run into its first sentence ("A Word Before the
 *   First Page Brother, before you…") becomes its own italic line.
 * - Page furniture the importer picked up (a running "PART THREE · WEEKS
 *   25 – 36" header, a lone page numeral, a repeated publisher line, a
 *   title page's caption) is dropped.
 *
 * Every all-caps heading line must be one it knows; anything else is
 * reported (`unknown`) rather than guessed at. Used by the importer for new
 * introductions (lib/import/parseStudyDocument.ts) and by
 * scripts/repair-introductions.ts for ones already stored.
 */

/** Uppercase letters only, so "HOW TO USE", "HOWTOUSE" and "How to Use" match. */
const keyOf = (text: string) => text.toUpperCase().replace(/[^A-Z]/g, "");

const SECTIONS: Record<string, string> = {
  FOREWORD: "Foreword",
  PREFACE: "Preface",
  HOWTOUSETHISSTUDY: "How to Use This Study",
  HOWTOUSETHISWORKBOOK: "How to Use This Workbook",
};

const SUBHEADINGS: Record<string, ["h3" | "h4", string]> = {
  THEWEEKLYRHYTHM: ["h3", "The Weekly Rhythm"],
  AFEWPRACTICALNOTES: ["h3", "A Few Practical Notes"],
  BEFOREWEEKONE: ["h3", "Before Week One"],
  PACING: ["h4", "Pacing"],
  THENUMBERING: ["h4", "The Numbering"],
  THEWORDSTUDIES: ["h4", "The Word Studies"],
  THESHAPEOFEACHWEEK: ["h4", "The Shape of Each Week"],
  THELINES: ["h4", "The Lines"],
  BROTHERHOOD: ["h4", "Brotherhood"],
  SCRIPTURE: ["h4", "Scripture"],
  THECAPSTONES: ["h4", "The Capstones"],
};

const PUBLISHER = "MARKETLIFEMINISTRIES";
const PUBLISHER_HTML = "<p><strong>MarketLife Ministries</strong></p>";

// "HOW TO USE" sits right above "A Few Practical Notes" in the Journey
// manuscripts; the Preface's subtitle says it on its own. "365 DAYS IN THE
// PSALMS" is the Psalms devotional's title page after its Preface.
const DROP = [/^HOWTOUSE$/, /^PART[A-Z]+ · WEEKS \d+ – \d+$/, /^\d+ DAYS IN THE PSALMS$/];
const PAGE_NUMERAL = /^[ivxlc]+$/i;

// Subtitles the general rule below can't find on its own: John's Prefaces
// open "Light in the Dust Part One ended at a pool…", where "Part One"
// reads like more title.
const KNOWN_SUBTITLES = [
  "A Word Before the First Page",
  "How to Use This Workbook",
  "How to Use This Study",
  "The Word in the Dust",
  "Light in the Dust",
  "Life in the Dust",
  "Finished in the Dust",
];

// Small words that can sit inside a title ("Grace Abounding in the Dust").
const CONNECTORS = new Set(["a", "an", "and", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "under", "with"]);

/**
 * Splits a subtitle off the front of a section's first paragraph, where the
 * manuscript set it on its own line and the importer joined it to the
 * first sentence: "How to Walk This Year This is a long walk…" becomes
 * ["How to Walk This Year", "This is a long walk…"]. The subtitle is a run
 * of capitalized words (and small connecting words); the sentence starts at
 * a capitalized word followed by an ordinary lowercase one ("This is", or
 * "Near the end"), or at an opening quotation mark. Returns null when the paragraph doesn't start
 * that way.
 */
export function splitRunInSubtitle(text: string): [string, string] | null {
  const known = KNOWN_SUBTITLES.find((s) => text.startsWith(`${s} `));
  if (known) return [known, text.slice(known.length).trim()];

  const words = text.split(" ");
  const capitalized = (w: string) => /^[A-Z0-9]/.test(w);
  for (let i = 0; i < Math.min(words.length - 1, 10); i++) {
    const word = words[i]!;
    const next = words[i + 1]!;
    const ordinary = (w: string | undefined) => !!w && /^[a-z]/.test(w) && !CONNECTORS.has(w);
    const sentenceStarts =
      /^[“"]/.test(word) ||
      (capitalized(word) && (ordinary(next) || (CONNECTORS.has(next) && ordinary(words[i + 2]))));
    if (i >= 2 && sentenceStarts && !CONNECTORS.has(words[i - 1]!)) {
      return [words.slice(0, i).join(" "), words.slice(i).join(" ")];
    }
    if (!capitalized(word) && !CONNECTORS.has(word)) return null;
  }
  return null;
}

export type IntroRepair = { html: string; unknown: string[] };

/**
 * Returns null when there's nothing to change: the body isn't a run of
 * paragraphs and section headings (already repaired, or hand-built), or
 * repairing it would leave it as it is.
 */
export function repairIntroHtml(body: string): IntroRepair | null {
  const ELEMENT = /<(p|h2)>[\s\S]*?<\/\1>/g;
  const elements = body.match(ELEMENT);
  if (!elements || body.replace(ELEMENT, "").trim() !== "") return null;

  const out: string[] = [];
  const unknown: string[] = [];
  let lastWasPublisher = false;
  let sectionStart = false;
  let lastSection = "";

  for (const element of elements) {
    const isHeading = element.startsWith("<h2>");
    const inner = element.slice(isHeading ? 4 : 3, isHeading ? -5 : -4).trim();
    const bold = /^<strong>([\s\S]*)<\/strong>$/.exec(inner);
    const text = (bold ? bold[1]! : inner).trim();
    const key = keyOf(text);
    const headingLike = isHeading || bold;

    if (headingLike && SECTIONS[key]) {
      lastSection = SECTIONS[key]!;
      out.push(`<h2>${lastSection}</h2>`);
      sectionStart = true;
      lastWasPublisher = false;
      continue;
    }
    if (isHeading) {
      out.push(element);
    } else if (bold && SUBHEADINGS[key]) {
      const [tag, words] = SUBHEADINGS[key]!;
      out.push(`<${tag}>${words}</${tag}>`);
    } else if (bold && key === PUBLISHER) {
      if (!lastWasPublisher) out.push(PUBLISHER_HTML);
      lastWasPublisher = true;
      sectionStart = false;
      continue;
    } else if ((bold && DROP.some((pattern) => pattern.test(text))) || PAGE_NUMERAL.test(text)) {
      // Page furniture.
    } else if (sectionStart && bold && /[a-z]/.test(text)) {
      // A section's own title line ("A Word Before You Begin", "Reading Genesis 18–50").
      out.push(`<p><em>${text}</em></p>`);
    } else if (bold && /\d/.test(text)) {
      // A verse reference; the PDF spaces its punctuation ("119 : 25 ( NKJV )").
      out.push(`<p><strong>${text.replace(/ : /g, ":").replace(/\( /g, "(").replace(/ \)/g, ")")}</strong></p>`);
    } else {
      const subtitle = sectionStart && !bold && !inner.startsWith("<") ? splitRunInSubtitle(text) : null;
      if (subtitle) {
        // "How to Use This Workbook" repeated under its own heading says nothing new.
        if (subtitle[0] !== lastSection) out.push(`<p><em>${subtitle[0]}</em></p>`);
        out.push(`<p>${subtitle[1]}</p>`);
      } else {
        // An all-caps bold line this doesn't know: report it rather than
        // leave a run-together heading or guess at its words.
        if (bold && /^[A-Z][A-Z ]{5,}$/.test(text)) unknown.push(text);
        out.push(element);
      }
    }
    sectionStart = false;
    lastWasPublisher = false;
  }

  const html = out.join("\n");
  return html === elements.join("\n") ? null : { html, unknown };
}
