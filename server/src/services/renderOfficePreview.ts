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

/**
 * Word embeds images at their original capture resolution, and mammoth inlines
 * every one as a base64 data: URI. On a real document in the library that
 * turned 0.9MB of .docx into 1.25MB of HTML that barely compresses (base64 of
 * already-compressed image data), which is most of what a reader waits for.
 * Re-encoding to a sensible display size costs a little CPU once — and the
 * result is cached (see previewCache.ts) — for a much smaller download.
 *
 * Best-effort: anything sharp cannot decode (Word also embeds WMF/EMF vector
 * blobs) is passed through untouched rather than failing the whole preview.
 */
const MAX_IMAGE_WIDTH = 1400;

const convertImage = mammoth.images.imgElement(async (image) => {
  const buffer = await image.read();
  try {
    const sharp = (await import("sharp")).default;
    const resized = await sharp(buffer)
      .rotate()
      .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer();
    if (resized.byteLength < buffer.byteLength) {
      return { src: `data:image/jpeg;base64,${resized.toString("base64")}` };
    }
  } catch {
    // fall through to the original bytes
  }
  return { src: `data:${image.contentType};base64,${buffer.toString("base64")}` };
});

export async function renderDocxToHtml(buffer: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml({ buffer }, { convertImage });
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
