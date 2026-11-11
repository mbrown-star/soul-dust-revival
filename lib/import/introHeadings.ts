/**
 * Repairs a Journey Part's introduction as imported from its manuscript.
 * The PDFs set headings in letter-spaced capitals, which the importer ran
 * together ("THEWEEKLYRHYTHM") and kept as bold paragraphs. This turns the
 * front matter into real structure, so a threshold can tab between its
 * sections (lib/journey/introSections.ts):
 *
 * - FOREWORD / PREFACE become `<h2>` sections.
 * - The Preface's sub-headings become `<h3>`/`<h4>` with their words back
 *   (spelled as the manuscripts print them).
 * - A subtitle run into the first sentence ("A Word Before the First Page …")
 *   becomes its own italic line.
 * - Page-furniture lines the importer picked up (a running "PART THREE ·
 *   WEEKS 25 – 36" header, a lone roman numeral, a repeated publisher line)
 *   are dropped.
 *
 * Every heading-like line must be one it knows; anything else stops the
 * repair (`unknown`) rather than being guessed at.
 */
const SECTIONS: Record<string, string> = { FOREWORD: "Foreword", PREFACE: "Preface" };

const SUBHEADINGS: Record<string, ["h3" | "h4", string]> = {
  THEWEEKLYRHYTHM: ["h3", "The Weekly Rhythm"],
  AFEWPRACTICALNOTES: ["h3", "A Few Practical Notes"],
  "A FEW PRACTICAL NOTES": ["h3", "A Few Practical Notes"],
  PACING: ["h4", "Pacing"],
  THENUMBERING: ["h4", "The Numbering"],
  THEWORDSTUDIES: ["h4", "The Word Studies"],
  THELINES: ["h4", "The Lines"],
  BROTHERHOOD: ["h4", "Brotherhood"],
  SCRIPTURE: ["h4", "Scripture"],
  THECAPSTONES: ["h4", "The Capstones"],
};

const PUBLISHER = "MARKETLIFEMINISTRIES";
// "HOW TO USE" sits right above "A Few Practical Notes" in the manuscript;
// the subtitle says it on its own.
const DROP = [/^HOWTOUSE$/, /^PART[A-Z]+ · WEEKS \d+ – \d+$/, /^[IVXLC]+$/];
const SUBTITLES = ["A Word Before the First Page", "How to Use This Workbook", "How to Use This Study"];

export type IntroRepair = { html: string; unknown: string[] };

export function repairJourneyIntroHtml(body: string): IntroRepair | null {
  const paragraphs = body.match(/<p>[\s\S]*?<\/p>/g);
  if (!paragraphs || body.replace(/<p>[\s\S]*?<\/p>/g, "").trim() !== "") return null;

  const out: string[] = [];
  const unknown: string[] = [];
  let lastWasPublisher = false;

  for (const paragraph of paragraphs) {
    const inner = paragraph.slice(3, -4).trim();
    const bold = /^<strong>([\s\S]*)<\/strong>$/.exec(inner);
    const text = (bold ? bold[1]! : inner).trim();
    const key = text.toUpperCase();

    if (bold && SECTIONS[text]) {
      out.push(`<h2>${SECTIONS[text]}</h2>`);
    } else if (bold && SUBHEADINGS[key]) {
      const [tag, words] = SUBHEADINGS[key]!;
      out.push(`<${tag}>${words}</${tag}>`);
    } else if (bold && text === PUBLISHER) {
      if (!lastWasPublisher) out.push("<p><strong>MarketLife Ministries</strong></p>");
      lastWasPublisher = true;
      continue;
    } else if (bold && DROP.some((pattern) => pattern.test(text))) {
      // Page furniture.
    } else {
      const subtitle = !bold ? SUBTITLES.find((s) => text.startsWith(`${s} `)) : undefined;
      if (subtitle) {
        out.push(`<p><em>${subtitle}</em></p>`, `<p>${text.slice(subtitle.length).trim()}</p>`);
      } else {
        // An all-caps bold line with no spaces is a run-together heading
        // this doesn't know: refuse rather than leave it or guess.
        if (bold && /^[A-Z]{6,}$/.test(text)) unknown.push(text);
        out.push(paragraph);
      }
    }
    lastWasPublisher = false;
  }
  return { html: out.join("\n"), unknown };
}
