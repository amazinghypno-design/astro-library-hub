/**
 * The MIME type a file should be stored with, when the browser won't say.
 *
 * `File.type` is empty for any extension the OS has no registration for, and
 * for Excel's macro-enabled formats that is common — Safari and Firefox
 * routinely report nothing for .xlsm/.xlsb. Upload then fell back to
 * application/octet-stream, which is what the presigned PUT is signed with and
 * what the row keeps forever, so the file downloaded later as an unknown blob
 * instead of opening in Excel.
 *
 * Only Excel is listed: it is the one family where the browser's answer is
 * unreliable AND the stored answer decides whether the file opens in the right
 * program. Everything else keeps whatever the browser reported.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  xlsb: "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
  xltx: "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
  xltm: "application/vnd.ms-excel.template.macroEnabled.12",
  xlam: "application/vnd.ms-excel.addin.macroEnabled.12",
  xla: "application/vnd.ms-excel",
  csv: "text/csv",
};

/** The browser's own answer wins whenever it gave a real one. */
export function mimeForUpload(file: File): string {
  const generic = !file.type || file.type === "application/octet-stream";
  if (!generic) return file.type;
  const lastDot = file.name.lastIndexOf(".");
  const extension = lastDot > 0 ? file.name.slice(lastDot + 1).toLowerCase() : "";
  return MIME_BY_EXTENSION[extension] ?? file.type ?? "application/octet-stream";
}
