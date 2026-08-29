import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { libraryFiles } from "../db/schema";
import { classifyDocumentType } from "../domain/classifyDocumentType";
import { isOcrableImage, isTextLayerThin } from "../domain/needsOcr";
import { storageAdapter } from "../storage/index";
import { extractOfficeText, hasExtractableText } from "./officeText";
import { ocrEnabled } from "../ocr/index";

/**
 * Everything expensive that happens to a newly uploaded PDF — text extraction
 * for search and Q&A, page count, orientation, and the recompressed rendition
 * the inline reader prefers — moved off the request that saves the file.
 *
 * It used to run inside finalizeUpload, which meant the admin's browser held a
 * request open for the whole thing. A 54MB scanned book never finished: the
 * work takes minutes on the free instance's half CPU, far past the 100s the
 * edge proxy in front of it allows, and the reply the browser eventually got
 * was a dropped connection reported as "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้". The upload had
 * in fact succeeded and the bytes were sitting in storage; only the row was
 * missing.
 *
 * So the row is written first and this runs after. A file is usable the moment
 * it is saved; the extras appear a little later. If the process dies partway,
 * the file still exists and only its extras are missing — the failure mode is
 * degraded, not lost.
 *
 * OCR is the last resort in that chain, and only ever a last resort: a file
 * that carries its own text is never sent to it. It exists for the half of
 * this library that is pictures of text — the exported posters and the
 * scanned books — which were otherwise unsearchable and unaskable.
 */

/** Bytes above which text extraction is skipped. Extraction is comparatively light — this is a backstop, not a tuning knob. */
const TEXT_EXTRACTION_MAX_BYTES = Number(process.env.TEXT_EXTRACTION_MAX_BYTES ?? 80 * 1024 * 1024);

/**
 * Bytes above which the recompressed reading rendition is skipped.
 *
 * Much lower than the extraction limit on purpose: compression holds the
 * source document, the output document and each page's decoded image in
 * memory at once, several times the file's own size. Exceeding 512MB does not
 * fail one upload, it kills the process and takes the whole site down with it,
 * so the cap is deliberately conservative. Nothing is lost by skipping it —
 * the reader falls back to the original file, which pdf.js fetches by page
 * with range requests rather than downloading whole.
 */
const PREVIEW_COMPRESSION_MAX_BYTES = Number(process.env.PREVIEW_COMPRESSION_MAX_BYTES ?? 25 * 1024 * 1024);

const PREVIEW_WORTHY_MIN_BYTES = 5 * 1024 * 1024;

/**
 * Bytes above which OCR is skipped. Between the extraction cap and the
 * compression one: OCR holds a single page image at a time rather than the
 * whole document, so it is nowhere near as memory-hungry as compression — but
 * a 200MB scan would still take hours of a half CPU for a text layer nobody is
 * waiting for.
 */
const OCR_MAX_BYTES = Number(process.env.OCR_MAX_BYTES ?? 60 * 1024 * 1024);

/**
 * One at a time, always. Two large books processed concurrently would each
 * claim hundreds of megabytes, which is the one thing this queue exists to
 * prevent — and there is no hurry: nobody is waiting on the result.
 */
let queue: Promise<void> = Promise.resolve();

export interface PostUploadOptions {
  /**
   * True when the admin picked the document type by hand on the upload form.
   * Their choice outranks the orientation heuristic, and there is no column
   * recording who set it — so the caller, which does know, passes it along.
   */
  documentTypeChosenByAdmin: boolean;
}

export function enqueuePostUploadProcessing(fileId: string, options: PostUploadOptions): void {
  queue = queue.then(() => processUploadedFile(fileId, options)).catch(() => {});
}

/** Exposed for tests and scripts; normal callers use the queue. */
export async function processUploadedFile(fileId: string, options: PostUploadOptions): Promise<void> {
  const [file] = await db
    .select({
      id: libraryFiles.id,
      mimeType: libraryFiles.mimeType,
      originalName: libraryFiles.originalName,
      storageKey: libraryFiles.storageKey,
      size: libraryFiles.size,
    })
    .from(libraryFiles)
    .where(eq(libraryFiles.id, fileId));

  if (!file) return;

  let bytes: Buffer;
  try {
    bytes = await storageAdapter.get(file.storageKey);
  } catch {
    return;
  }

  // Word and Excel files carry their text in the file itself; pulling it out
  // here is what lets them be searched and asked questions about, the same as
  // a PDF. Nothing else in this function applies to them.
  if (hasExtractableText(file.mimeType, file.originalName)) {
    if (bytes.byteLength > TEXT_EXTRACTION_MAX_BYTES) return;
    try {
      const text = await extractOfficeText(bytes, file.mimeType, file.originalName);
      if (text) await db.update(libraryFiles).set({ extractedText: text }).where(eq(libraryFiles.id, fileId));
    } catch {
      // A corrupt document simply has no text to offer.
    }
    return;
  }

  // A poster exported as PNG is text as far as a reader is concerned and
  // nothing at all as far as search is concerned. OCR is the only way in.
  if (isOcrableImage(file.mimeType)) {
    if (!ocrEnabled || bytes.byteLength > OCR_MAX_BYTES) return;
    try {
      const { ocrImage } = await import("./ocrText");
      const result = await ocrImage(bytes);
      if (result.pagesRead > 0) {
        await db.update(libraryFiles).set({ extractedText: result.text }).where(eq(libraryFiles.id, fileId));
      }
    } catch {
      // An image OCR cannot read stays exactly as searchable as it was before.
    }
    return;
  }

  if (file.mimeType !== "application/pdf") return;

  if (bytes.byteLength <= TEXT_EXTRACTION_MAX_BYTES) {
    let textLayerIsThin = false;
    try {
      const { inspectPdf } = await import("./pdfMetadata");
      const inspection = await inspectPdf(bytes);
      const detectedType = classifyDocumentType(file.mimeType, file.originalName, inspection.pageOrientation);
      textLayerIsThin = isTextLayerThin(inspection.fullText, inspection.pageCount);
      await db
        .update(libraryFiles)
        .set({
          extractedText: inspection.fullText,
          pageCount: inspection.pageCount,
          // An explicit choice by the admin always wins over the heuristic.
          ...(options.documentTypeChosenByAdmin ? {} : { documentType: detectedType }),
        })
        .where(eq(libraryFiles.id, fileId));
    } catch {
      // A malformed or encrypted PDF has no text layer to offer — which is
      // itself a reason to try reading the pages as pictures.
      textLayerIsThin = true;
    }

    // Only now, once the cheap path has been given its chance and come back
    // with almost nothing: this book is a stack of scans.
    if (textLayerIsThin && ocrEnabled && bytes.byteLength <= OCR_MAX_BYTES) {
      try {
        const { ocrPdf } = await import("./ocrText");
        const result = await ocrPdf(bytes);
        if (result.pagesRead > 0) {
          await db.update(libraryFiles).set({ extractedText: result.text }).where(eq(libraryFiles.id, fileId));
        }
      } catch {
        // A scan OCR cannot read is left as it was: findable by title, not by content.
      }
    }
  }

  const worthCompressing =
    bytes.byteLength > PREVIEW_WORTHY_MIN_BYTES && bytes.byteLength <= PREVIEW_COMPRESSION_MAX_BYTES;
  if (!worthCompressing) return;

  try {
    const { compressPdfBuffer } = await import("./compressPdfBuffer");
    const { bytes: previewBytes } = await compressPdfBuffer(bytes, { quality: 80, maxDimension: 1800 });
    if (previewBytes.byteLength >= bytes.byteLength) return;
    const key = `${file.storageKey}.preview.pdf`;
    await storageAdapter.put(key, previewBytes, "application/pdf");
    await db.update(libraryFiles).set({ previewStorageKey: key }).where(eq(libraryFiles.id, fileId));
  } catch {
    // The reader falls back to the original file.
  }
}
