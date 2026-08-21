import type { Buffer } from "node:buffer";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

/** Formats whose text can be read straight out of the file, no OCR involved. */
export function hasExtractableText(mimeType: string): boolean {
  return mimeType === DOCX_MIME || XLSX_MIMES.has(mimeType);
}

/**
 * Plain text out of a Word or Excel file, for search and for the per-book Q&A.
 * The upload pipeline only ever did this for PDFs, so every Word document in
 * the library answered "เล่มนี้ยังไม่รองรับระบบถามตอบอัตโนมัติ" — not because the
 * text was unavailable, but because nobody had asked for it. Both libraries
 * are already dependencies (they render the inline Office preview).
 */
export async function extractOfficeText(bytes: Buffer, mimeType: string): Promise<string> {
  if (mimeType === DOCX_MIME) {
    const mammoth = (await import("mammoth")).default;
    const { value } = await mammoth.extractRawText({ buffer: bytes });
    return value.trim();
  }
  if (XLSX_MIMES.has(mimeType)) {
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
