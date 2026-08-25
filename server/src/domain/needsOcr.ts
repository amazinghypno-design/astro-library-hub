/**
 * Whether a file's own text layer is thin enough that the page is really a
 * picture of text, and OCR is the only way to read it.
 *
 * A scanned PDF is rarely empty of text. Scanning software stamps a cover
 * sheet, a page-number strip, or a few stray glyphs from a failed glyph map,
 * so "is the extracted text empty?" misses most real scans. What actually
 * separates them is text per page: a typeset book runs to hundreds of
 * characters on every page, while a scan that happens to carry a header comes
 * to a handful.
 */

/** Below this many characters per page, a PDF is treated as a picture of text. */
const MIN_CHARS_PER_PAGE = 120;

/** Below this, a document is treated as having no text at all whatever its page count. */
const MIN_CHARS_TOTAL = 200;

export function isTextLayerThin(text: string | null | undefined, pageCount: number | null | undefined): boolean {
  const chars = countMeaningfulChars(text ?? "");
  if (chars < MIN_CHARS_TOTAL) return true;
  const pages = pageCount && pageCount > 0 ? pageCount : 1;
  return chars / pages < MIN_CHARS_PER_PAGE;
}

/**
 * Whitespace does not count. A broken PDF whose text layer decodes to nothing
 * but newlines and spaces would otherwise look like a well-populated document
 * purely on length.
 */
function countMeaningfulChars(text: string): number {
  return text.replace(/\s+/g, "").length;
}

/** Image formats worth pointing OCR at. A poster saved as PNG is text to a reader, and nothing at all to search. */
const OCR_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/tiff", "image/bmp"]);

export function isOcrableImage(mimeType: string): boolean {
  return OCR_IMAGE_MIME_TYPES.has(mimeType.toLowerCase());
}
