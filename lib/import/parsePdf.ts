import pdfParse from "pdf-parse";

/**
 * Extracts plain text from a PDF. Unlike DOCX, PDFs don't preserve heading
 * styles in an easily accessible way — this returns raw text, and heading
 * detection for lesson-splitting is done heuristically (see splitIntoLessons.ts).
 */
export async function parsePdfToText(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text;
}
