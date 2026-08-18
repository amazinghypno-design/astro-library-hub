export type DocumentType = "ebook" | "document" | "spreadsheet" | "slide" | "poster" | "other";
export type PageOrientation = "portrait" | "landscape";

/**
 * "Poster" is intentionally never auto-assigned here — there is no reliable
 * file-level signal for "this is a poster" (unlike slide vs ebook, which has
 * a clear orientation signal). It stays a manual-only choice in the upload
 * form. This function only produces the types it can infer with reasonable
 * confidence, matching the same "don't guess without evidence" rule used
 * for metadata extraction.
 */
export function classifyDocumentType(mimeType: string, originalName: string, pageOrientation?: PageOrientation): DocumentType {
  const normalized = mimeType.toLowerCase().trim();
  const extension = originalName.split(".").pop()?.toLowerCase();

  if (normalized.includes("spreadsheet") || normalized === "text/csv" || normalized === "application/vnd.ms-excel" || extension === "xlsx" || extension === "xls") {
    return "spreadsheet";
  }

  const isPdfOrEpub = normalized === "application/pdf" || normalized === "application/epub+zip";
  if (isPdfOrEpub) {
    return pageOrientation === "landscape" ? "slide" : "ebook";
  }

  if (normalized.startsWith("text/") || normalized.includes("wordprocessingml") || normalized === "application/msword" || extension === "docx" || extension === "doc") {
    return "document";
  }

  return "other";
}

/** Page width > height (with a small tolerance for near-square pages) means landscape/slide orientation. */
export function pageOrientationFromDimensions(width: number, height: number): PageOrientation {
  return width > height * 1.05 ? "landscape" : "portrait";
}
