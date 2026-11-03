import { PDFParse } from "pdf-parse";

/**
 * Extracts plain text from a PDF. Unlike DOCX, PDFs don't preserve heading
 * styles in an easily accessible way — this returns raw text, and heading
 * detection for lesson-splitting is done heuristically (see splitIntoLessons.ts).
 */
export async function parsePdfToText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
