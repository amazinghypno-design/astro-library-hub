/**
 * Which Excel files are "โปรแกรม" and which are just tables.
 *
 * A macro-enabled workbook (.xlsm/.xlsb/.xltm) is not a spreadsheet someone
 * reads — it is a program someone runs, kept in the library so it can be
 * downloaded and used again. It gets its own documentType ("program") rather
 * than being filed under "spreadsheet", because the two are looked for in
 * completely different moods: "show me the data" vs "give me the tool".
 *
 * Extension matters as much as MIME here: browsers disagree about what to
 * report for .xlsm/.xlsb (Safari and Firefox often send nothing at all, which
 * arrives as application/octet-stream), so nothing downstream may depend on
 * the MIME type alone.
 */

/** Macro-enabled / binary workbooks — an Excel file that carries code. */
const PROGRAM_MIME = new Set([
  "application/vnd.ms-excel.sheet.macroEnabled.12", // .xlsm
  "application/vnd.ms-excel.sheet.binary.macroEnabled.12", // .xlsb
  "application/vnd.ms-excel.template.macroEnabled.12", // .xltm
  "application/vnd.ms-excel.addin.macroEnabled.12", // .xlam
]);
const PROGRAM_EXTENSIONS = new Set(["xlsm", "xlsb", "xltm", "xlam", "xla"]);

/** Plain workbooks and templates — data, no code. */
const SHEET_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template", // .xltx
]);
const SHEET_EXTENSIONS = new Set(["xlsx", "xls", "xltx"]);

/**
 * Add-ins are the one Excel format SheetJS cannot open as a workbook: .xla is
 * a legacy binary blob and .xlam is a macro container with no sheets worth
 * showing. They are stored and downloaded like anything else, just never
 * previewed or read for text.
 */
const ADDIN_EXTENSIONS = new Set(["xlam", "xla"]);

export function fileExtension(originalName: string): string {
  const lastDot = originalName.lastIndexOf(".");
  return lastDot > 0 ? originalName.slice(lastDot + 1).toLowerCase() : "";
}

export function isExcelProgram(mimeType: string, originalName: string): boolean {
  return PROGRAM_MIME.has(mimeType.toLowerCase().trim()) || PROGRAM_EXTENSIONS.has(fileExtension(originalName));
}

export function isExcelSheet(mimeType: string, originalName: string): boolean {
  return SHEET_MIME.has(mimeType.toLowerCase().trim()) || SHEET_EXTENSIONS.has(fileExtension(originalName));
}

/** Any Excel file at all — program or plain sheet. */
export function isExcelFile(mimeType: string, originalName: string): boolean {
  return isExcelProgram(mimeType, originalName) || isExcelSheet(mimeType, originalName);
}

/** True when SheetJS can open it as a workbook (so it can be previewed and read for text). */
export function isReadableWorkbook(mimeType: string, originalName: string): boolean {
  return isExcelFile(mimeType, originalName) && !ADDIN_EXTENSIONS.has(fileExtension(originalName));
}
