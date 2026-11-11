import { describe, expect, it } from "vitest";
import { fileTypeLabel, formatFileSize } from "./fileSize";

describe("formatFileSize and fileTypeLabel", () => {
  it("reads like a person would say it", () => {
    expect(formatFileSize(91_146)).toBe("89 KB");
    expect(formatFileSize(10)).toBe("1 KB");
    expect(formatFileSize(1.25 * 1024 * 1024)).toBe("1.3 MB");
    expect(formatFileSize(34 * 1024 * 1024)).toBe("34 MB");
    expect(fileTypeLabel("application/pdf")).toBe("PDF");
    expect(fileTypeLabel("application/epub+zip")).toBe("EPUB");
  });
});
