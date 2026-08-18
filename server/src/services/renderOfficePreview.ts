import mammoth from "mammoth";
import * as XLSX from "xlsx";
import sanitizeHtml from "sanitize-html";

/**
 * Converts docx/xlsx bytes to sanitized HTML entirely on our own server —
 * never hands the file to a third-party viewer (Google Docs Viewer, Office
 * Online, etc.), which would require making a private, access-controlled
 * file reachable by an outside service. Output is sanitized before it ever
 * reaches dangerouslySetInnerHTML on the client — see PROJECT rule against
 * unsanitized HTML from user-uploaded content.
 */
export async function renderDocxToHtml(buffer: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml({ buffer });
  return sanitizeHtml(result.value, {
    allowedTags: ["p", "b", "i", "u", "strong", "em", "h1", "h2", "h3", "h4", "ul", "ol", "li", "br", "table", "thead", "tbody", "tr", "td", "th", "a", "img"],
    allowedAttributes: { a: ["href"], img: ["src", "alt"] },
    allowedSchemes: ["http", "https", "data"],
  });
}

export interface RenderedSheet {
  name: string;
  html: string;
}

/** One sheet per tab client-side, instead of one giant stacked page — see todo.md Phase 9. */
export async function renderXlsxToSheets(buffer: Buffer): Promise<RenderedSheet[]> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const tableHtml = XLSX.utils.sheet_to_html(sheet, { id: undefined });
    const sanitized = sanitizeHtml(tableHtml, {
      allowedTags: ["table", "thead", "tbody", "tr", "td", "th", "br"],
      allowedAttributes: { table: ["border"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] },
    });
    return { name, html: sanitized };
  });
}
