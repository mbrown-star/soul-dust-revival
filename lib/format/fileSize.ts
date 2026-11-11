/** "91 KB", "1.2 MB", "34 MB": a file size as people read it. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

/** "PDF" from "application/pdf"; the subtype in capitals otherwise. */
export function fileTypeLabel(contentType: string): string {
  const subtype = contentType.split("/")[1] ?? contentType;
  return subtype.split(/[.+-]/)[0]!.toUpperCase();
}
