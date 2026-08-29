import type { Buffer } from "node:buffer";
import { isReadableWorkbook } from "../domain/excelFormats";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Formats whose text can be read straight out of the file, no OCR involved.
 *
 * originalName is optional only so older call sites keep compiling: pass it
 * whenever it is at hand, because a .xlsm arriving as application/octet-stream
 * (which is what Safari and Firefox report) is recognisable by nothing else.
 */
export function hasExtractableText(mimeType: string, originalName = ""): boolean {
  return mimeType === DOCX_MIME || isReadableWorkbook(mimeType, originalName);
}

/**
 * Plain text out of a Word or Excel file, for search and for the per-book Q&A.
 * The upload pipeline only ever did this for PDFs, so every Word document in
 * the library answered "เล่มนี้ยังไม่รองรับระบบถามตอบอัตโนมัติ" — not because the
 * text was unavailable, but because nobody had asked for it. Both libraries
 * are already dependencies (they render the inline Office preview).
 */
export async function extractOfficeText(bytes: Buffer, mimeType: string, originalName = ""): Promise<string> {
  if (mimeType === DOCX_MIME) {
    const mammoth = (await import("mammoth")).default;
    const { value } = await mammoth.extractRawText({ buffer: bytes });
    return value.trim();
  }
  if (isReadableWorkbook(mimeType, originalName)) {
    const XLSX = await import("xlsx");
    const book = XLSX.read(bytes, { type: "buffer" });
    // Sheet name included: in a workbook of tables it is often the only label
    // saying what the numbers underneath are.
    return book.SheetNames.map((name) => `[${name}]\n${XLSX.utils.sheet_to_csv(book.Sheets[name])}`)
      .join("\n\n")
      .trim();
  }
  return "";
}
