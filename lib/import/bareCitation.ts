/**
 * A paragraph that opens with nothing but a Scripture citation in brackets,
 * "(Genesis 18:14). A year later…", "(1 John 1:9)". In the books it always
 * belongs to the quotation just before it. The importer used to end the
 * paragraph at the quotation's own "?”" or "!”", leaving the citation to
 * start the next one (35 devotional days, found by the 2026-11-13 staging
 * audit).
 */
export const BARE_CITATION_START = /^\((?:[1-3] ?)?[A-Z][a-z]+(?: [A-Z][a-z]+)* \d+:\d+[^)]*\)/;

export function startsWithBareCitation(text: string): boolean {
  return BARE_CITATION_START.test(text.trim());
}
