import { isExcelFile, isReadableWorkbook } from "./excelFormats";

export type PreviewCapability =
  | "pdf-inline"
  | "image-inline"
  | "text-inline"
  | "docx-inline"
  | "xlsx-inline"
  | "download-fallback"
  | "unsupported";

const INLINE_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const INLINE_TEXT_MIME = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
]);

// mammoth only understands the modern XML-based .docx, not legacy binary .doc
const DOCX_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// SheetJS reads both modern .xlsx and legacy binary .xls
const SPREADSHEET_INLINE_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

const KNOWN_DOWNLOAD_ONLY_MIME = new Set([
  "application/msword",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
]);

/**
 * Single source of truth for how a file can be shown in the browser.
 * Every page (Home, Search, Catalog, FileDetail) must call this instead of
 * duplicating MIME rules — see TROUBLESHOOTING-HANDBOOK.md "ปัญหา viewer".
 */
export function previewCapability(mimeType: string, originalName: string): PreviewCapability {
  const normalized = mimeType.toLowerCase().trim();
  const extension = originalName.split(".").pop()?.toLowerCase();

  if (normalized === "application/pdf") return "pdf-inline";
  if (INLINE_IMAGE_MIME.has(normalized)) return "image-inline";
  if (INLINE_TEXT_MIME.has(normalized)) return "text-inline";
  if (DOCX_MIME.has(normalized) || extension === "docx") return "docx-inline";
  // Macro-enabled and binary workbooks (.xlsm/.xlsb/.xltm) open in SheetJS
  // exactly like a plain .xlsx does — the macros simply aren't part of what a
  // sheet renderer shows. So a stored Excel program still gets a real preview
  // of its sheets; only add-ins (.xlam/.xla), which have no sheets, fall back.
  if (isReadableWorkbook(normalized, originalName)) return "xlsx-inline";
  if (SPREADSHEET_INLINE_MIME.has(normalized)) return "xlsx-inline";
  if (isExcelFile(normalized, originalName)) return "download-fallback";
  if (KNOWN_DOWNLOAD_ONLY_MIME.has(normalized)) return "download-fallback";

  if (extension && ["doc", "ppt", "pptx"].includes(extension)) {
    return "download-fallback";
  }

  return "unsupported";
}
