import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { libraryFiles } from "../db/schema";
import { classifyDocumentType } from "../domain/classifyDocumentType";
import { storageAdapter } from "../storage/index";
import { extractOfficeText, hasExtractableText } from "./officeText";

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
  if (hasExtractableText(file.mimeType)) {
    if (bytes.byteLength > TEXT_EXTRACTION_MAX_BYTES) return;
    try {
      const text = await extractOfficeText(bytes, file.mimeType);
      if (text) await db.update(libraryFiles).set({ extractedText: text }).where(eq(libraryFiles.id, fileId));
    } catch {
      // A corrupt document simply has no text to offer.
    }
    return;
  }

  if (file.mimeType !== "application/pdf") return;

  if (bytes.byteLength <= TEXT_EXTRACTION_MAX_BYTES) {
    try {
      const { inspectPdf } = await import("./pdfMetadata");
      const inspection = await inspectPdf(bytes);
      const detectedType = classifyDocumentType(file.mimeType, file.originalName, inspection.pageOrientation);
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
      // A malformed or encrypted PDF simply has no text to offer.
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
