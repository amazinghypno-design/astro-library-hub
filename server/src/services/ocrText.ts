import sharp from "sharp";
import { PDFParse } from "pdf-parse";
import { ocrAdapter } from "../ocr/index";

/**
 * Reading text off files that only ever contained a picture of it — the
 * scanned books and the exported posters, which until now were invisible to
 * both search and the per-book Q&A because `pdf-parse` can only read a text
 * layer that is actually there.
 *
 * Everything here is deliberately bounded. OCR is the most expensive work this
 * server does, it runs on the same half CPU as everything else, and it is
 * never the reason a reader is waiting — so it caps pages, caps pixels, and
 * gives up on a budget rather than running until the instance falls over.
 */

/** Pages of one book to read. A 400-page scan at a few seconds a page is half an hour; nobody needs all of it to search well. */
const MAX_PAGES = Number(process.env.OCR_MAX_PAGES ?? 250);

/**
 * Longest edge fed to the engine. Tesseract gains nothing from more pixels
 * than this (measured: upscaling this library's own posters moved confidence
 * 88 → 89 and cost 50% more time) and every pixel is memory on an instance
 * that has little to spare.
 */
const MAX_EDGE_PX = Number(process.env.OCR_MAX_EDGE_PX ?? 2200);

/** Whole-file ceiling. A book that is somehow still going after this stops with the pages it managed. */
const TIME_BUDGET_MS = Number(process.env.OCR_TIME_BUDGET_MS ?? 15 * 60 * 1000);

/** Below this, a page produced nothing worth keeping — blank scans, dividers, plates. */
const MIN_CHARS_PER_PAGE = 8;

export interface OcrResult {
  text: string;
  /** Pages that produced text. Zero means the file really is unreadable, not that OCR was skipped. */
  pagesRead: number;
  /** True when a cap stopped the run early, so the caller can say so rather than implying the whole book was read. */
  truncated: boolean;
}

/**
 * Flattened onto white and capped in size before the engine sees it. The
 * flatten matters: a PNG poster exported with a transparent background reads
 * as black-on-black once the alpha channel is dropped, and comes back empty.
 */
async function prepare(image: Buffer): Promise<Buffer> {
  return sharp(image)
    .flatten({ background: "#ffffff" })
    .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
}

/** Reads a standalone image file — the posters, which are the whole of this library's untouchable half. */
export async function ocrImage(bytes: Buffer): Promise<OcrResult> {
  try {
    const text = await ocrAdapter.recognizeImage(await prepare(bytes));
    const clean = text.trim();
    return { text: clean, pagesRead: clean.length >= MIN_CHARS_PER_PAGE ? 1 : 0, truncated: false };
  } finally {
    await ocrAdapter.shutdown();
  }
}

/**
 * Reads a scanned PDF page by page.
 *
 * The page images come from `pdf-parse`'s own extractor rather than by
 * rasterizing the page: a scanned page IS one full-page image, so pulling it
 * out is both faithful and far cheaper than rendering — and it means no
 * native canvas dependency has to survive a deploy. A page that turns out not
 * to hold one dominant image is not a scan and is skipped; whatever text it
 * has was already read by the text-layer path.
 */
export async function ocrPdf(bytes: Buffer): Promise<OcrResult> {
  const parser = new PDFParse({ data: bytes });
  const startedAt = Date.now();
  const pages: string[] = [];
  let pagesRead = 0;
  let truncated = false;

  try {
    const info = await parser.getInfo({ parsePageInfo: true });
    const total = info.total;
    const limit = Math.min(total, MAX_PAGES);
    if (limit < total) truncated = true;

    for (let pageNum = 1; pageNum <= limit; pageNum++) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        truncated = true;
        break;
      }

      // Pulling the image out is inside the guard, not just the reading of it:
      // a PDF can name an image in its page tree that is not actually in the
      // file, and pdf-parse throws ("Image object img_p0_1 not found") rather
      // than returning nothing. Left outside, that one broken page threw all
      // the way out and cost the book every other page — which is exactly what
      // happened to นวกพยากรณ์ on the first backfill run.
      let text: string;
      try {
        const extracted = await parser.getImage({ partial: [pageNum], imageBuffer: true, imageDataUrl: false, imageThreshold: 0 });
        const images = extracted.pages[0]?.images ?? [];
        // The page scan is the biggest image on the page; a rule or a logo is not it.
        const dominant = images.slice().sort((a, b) => b.width * b.height - a.width * a.height)[0];
        if (!dominant || dominant.width < 200 || dominant.height < 200) continue;
        text = await ocrAdapter.recognizeImage(await prepare(Buffer.from(dominant.data)));
      } catch {
        continue; // One unreadable page does not cost the book the other 249.
      }

      const clean = text.trim();
      if (clean.length < MIN_CHARS_PER_PAGE) continue;
      // The page marker is what later lets a search result say which page it found.
      pages.push(`[หน้า ${pageNum}]\n${clean}`);
      pagesRead++;
    }
  } finally {
    await parser.destroy();
    await ocrAdapter.shutdown();
  }

  return { text: pages.join("\n\n"), pagesRead, truncated };
}
