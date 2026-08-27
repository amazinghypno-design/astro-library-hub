import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * A book's cover is page 1 of its own PDF. Rendering it here — in the admin's
 * browser, where pdf.js is already loaded for the reader — rather than on the
 * server is not a stylistic choice: the server is a half-CPU free instance
 * that already refuses to compress anything over 25MB for fear of running out
 * of memory (see server/src/services/postUploadProcessing.ts), and
 * rasterizing a page needs a canvas it doesn't have. Here the work is one
 * page on a machine that is idle anyway, and the server only ever receives a
 * ~40KB image.
 *
 * Deliberately NOT an AI-generated cover: image models cannot render Thai
 * script, and nearly every title in this library is Thai — a generated cover
 * would carry a title that looks like Thai and reads as nothing. The real
 * page 1 is also simply more useful: it is the cover the owner would
 * recognise off a shelf.
 */

/** Rendered width in pixels. Cards show covers around 180px wide; 600 keeps them sharp on Retina and still lands well under 100KB as WebP. */
const COVER_WIDTH = 600;

/** Pages taller than this ratio (a long receipt-shaped export) get cropped to it rather than producing a sliver of a card. */
const MAX_ASPECT = 1.7;

export interface RenderedCover {
  /** Base64 WebP (or JPEG where WebP encoding isn't available), no data: prefix — sent as-is to admin.saveCover. */
  base64: string;
  width: number;
  height: number;
}

function encode(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    // Quality 0.82: past this the file grows faster than the picture improves,
    // and a cover is never looked at closely.
    canvas.toBlob((blob) => resolve(blob), "image/webp", 0.82);
  });
}

function encodeJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85));
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  // Chunked rather than String.fromCharCode(...bytes): spreading a 100KB array
  // into arguments overflows the call stack in Safari.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function renderFirstPage(doc: pdfjsLib.PDFDocumentProxy): Promise<RenderedCover | null> {
  const page = await doc.getPage(1);
  const unscaled = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: COVER_WIDTH / unscaled.width });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(Math.min(viewport.height, viewport.width * MAX_ASPECT));
  const context = canvas.getContext("2d");
  if (!context) return null;

  // A PDF page with no background of its own is transparent, which WebP keeps
  // — and a transparent cover on a cream card looks like a rendering failure.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: context, viewport, canvas }).promise;

  const blob = (await encode(canvas)) ?? (await encodeJpeg(canvas));
  if (!blob) return null;

  return { base64: await blobToBase64(blob), width: canvas.width, height: canvas.height };
}

/**
 * Best-effort throughout: a cover is decoration, and no failure here may ever
 * fail the upload that triggered it. An encrypted, malformed or simply
 * non-PDF file returns null and the card falls back to its type icon.
 */
async function withDocument(
  source: Parameters<typeof pdfjsLib.getDocument>[0],
): Promise<RenderedCover | null> {
  let doc: pdfjsLib.PDFDocumentProxy | null = null;
  try {
    doc = await pdfjsLib.getDocument(source).promise;
    return await renderFirstPage(doc);
  } catch {
    return null;
  } finally {
    void doc?.destroy();
  }
}

export async function renderCoverFromFile(file: File): Promise<RenderedCover | null> {
  if (file.type !== "application/pdf") return null;
  // slice(0) because pdf.js takes ownership of the buffer it is handed and
  // detaches it — the upload path hashes the same bytes and must keep its copy.
  const data = (await file.arrayBuffer()).slice(0);
  return withDocument({ data });
}

/**
 * Backfill path: pdf.js fetches by range request, so a 50MB scanned book costs
 * a few hundred KB to take a cover from, not 50MB.
 */
export async function renderCoverFromUrl(url: string): Promise<RenderedCover | null> {
  // Same options the reader opens a book with: fetch only the ranges page 1
  // actually needs instead of pulling the whole document down first.
  return withDocument({ url, disableAutoFetch: true, rangeChunkSize: 262144 });
}
