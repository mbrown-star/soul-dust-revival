import mammoth from "mammoth";

/**
 * Converts a .docx buffer to HTML. Mammoth preserves heading styles
 * (Heading 1/2 in Word become <h1>/<h2>), which is what makes automatic
 * lesson-splitting possible — Word's own heading structure becomes the
 * lesson boundaries.
 */
export async function parseDocxToHtml(buffer: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml({ buffer });
  return result.value;
}
