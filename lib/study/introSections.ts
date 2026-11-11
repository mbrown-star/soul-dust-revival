/**
 * Splits an introduction's HTML into its sections at each top-level `<h2>`
 * (Foreword, Preface, …), so a Journey threshold can show one tab per
 * section. The heading itself becomes the tab's label and is left out of the
 * section's HTML. Anything before the first heading stays with the first
 * section. Fewer than two headings means there's nothing to tab between, so
 * it returns an empty list and the caller shows the introduction as it is.
 *
 * Expects HTML that has already been sanitized.
 */
export type IntroSection = { title: string; html: string };

const H2 = /<h2[^>]*>([\s\S]*?)<\/h2>/g;

function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitIntroSections(html: string): IntroSection[] {
  const headings = [...html.matchAll(H2)];
  if (headings.length < 2) return [];

  const before = html.slice(0, headings[0]!.index).trim();
  return headings.map((match, i) => {
    const start = match.index! + match[0].length;
    const end = headings[i + 1]?.index ?? html.length;
    const body = html.slice(start, end).trim();
    return {
      title: plainText(match[1]!) || `Section ${i + 1}`,
      html: i === 0 && before ? `${before}\n${body}` : body,
    };
  });
}
