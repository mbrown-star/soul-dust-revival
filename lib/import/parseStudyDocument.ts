import { parseDocxToHtml } from "./parseDocx";
import { parsePdfToText } from "./parsePdf";
import { splitHtmlByHeadings, splitPlainTextByHeadings, splitStudyPlainTextByHeadings } from "./splitIntoLessons";
import { sanitizeHtml } from "@/lib/sanitize/html";

// Shared by both the create-path importer (app/api/admin/studies/import)
// and the reimport route (app/api/admin/studies/reimport) -- a lesson is an
// ordered list of content blocks, not just one HTML body, because a Study's
// "QUESTION" and "Going Deeper" sections become their own question/callout
// blocks (see splitStudyPlainTextByHeadings), while a Devotional's or a
// .docx's content is always a single text block. Both shapes are normalized
// to this one structure so each route's own insert logic doesn't need to
// branch on where the parsed lessons came from.
export type ParsedBlock =
  | { type: "text"; body: string }
  | { type: "question"; questionPrompt: string }
  | { type: "callout"; calloutTitle: string; body: string };

export type ParsedStudyLesson = { title: string; blocks: ParsedBlock[] };

/**
 * Parses an uploaded study document (.docx or .pdf) into lessons, picking
 * the right splitter for the file type and, for a .pdf, the study's own
 * `kind` (a Study document's "QUESTION"/"Going Deeper" sections need
 * `splitStudyPlainTextByHeadings`; a Devotional's or Book's plain reading
 * text uses the generic `splitPlainTextByHeadings`). `isDocx`/`isPdf` are
 * the caller's own file-extension check, already validated before this is
 * called.
 */
export async function parseStudyDocument(
  buffer: Buffer,
  { isDocx, kind }: { isDocx: boolean; kind: "devotional" | "study" | "book" }
): Promise<ParsedStudyLesson[]> {
  if (isDocx) {
    return splitHtmlByHeadings(await parseDocxToHtml(buffer)).map((l) => ({
      title: l.title,
      blocks: [{ type: "text", body: l.bodyHtml }],
    }));
  }
  if (kind === "study") {
    return splitStudyPlainTextByHeadings(await parsePdfToText(buffer)).map((l) => ({
      title: l.title,
      blocks: l.blocks.map((b) =>
        b.type === "question"
          ? { type: "question", questionPrompt: b.questionPrompt }
          : b.type === "callout"
            ? { type: "callout", calloutTitle: b.calloutTitle, body: b.bodyHtml }
            : { type: "text", body: b.bodyHtml }
      ),
    }));
  }
  return splitPlainTextByHeadings(await parsePdfToText(buffer)).map((l) => ({
    title: l.title,
    blocks: [{ type: "text", body: l.bodyHtml }],
  }));
}

export type ContentBlockInsertValue =
  | { lessonId: string; orderIndex: number; type: "text"; body: string }
  | { lessonId: string; orderIndex: number; type: "question"; questionPrompt: string }
  | { lessonId: string; orderIndex: number; type: "callout"; calloutTitle: string; body: string };

/**
 * Turns one lesson's parsed blocks into content_blocks insert values,
 * sanitizing any stored HTML (an imported document is untrusted input even
 * when uploaded by an admin — see SECURITY.md's XSS section) and slicing
 * every text field to its column's own length cap. Shared by both the
 * create-path importer and the reimport route so the same two rules can't
 * drift apart between them.
 */
export function toContentBlockInserts(lessonId: string, blocks: ParsedBlock[]): ContentBlockInsertValue[] {
  return blocks.map((block, orderIndex) => {
    if (block.type === "question") {
      return { lessonId, orderIndex, type: "question", questionPrompt: block.questionPrompt.slice(0, 2_000) };
    }
    if (block.type === "callout") {
      return {
        lessonId,
        orderIndex,
        type: "callout",
        calloutTitle: block.calloutTitle.slice(0, 200),
        body: sanitizeHtml(block.body),
      };
    }
    return { lessonId, orderIndex, type: "text", body: sanitizeHtml(block.body) };
  });
}
