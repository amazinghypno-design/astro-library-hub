import { PDFParse } from "pdf-parse";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

const SCAN_PAGE_ASPECT_TOLERANCE = 0.15; // image aspect ratio must be within 15% of the page's to count as "the page scan"

export interface CompressPdfOptions {
  /** JPEG quality 1-100. Default 85 (visually close to lossless for scans). */
  quality?: number;
  /** Longest edge, in pixels, to downscale a recompressed page image to. Undefined = keep original resolution. */
  maxDimension?: number;
}

/**
 * Shrinks scanned-book PDFs (one big raster image per page, often exported
 * uncompressed or lightly compressed by scanning software) by re-encoding
 * each page's dominant image as JPEG. A page is only touched when one image
 * clearly covers almost the whole page (a scan); pages that are mostly
 * text/vector content are copied through byte-for-byte unchanged, so a mixed
 * document never loses real (selectable) text. Shared by the standalone CLI
 * (scripts/compressPdf.ts) and the inline-reader rendition generated at
 * upload time (routers/admin.ts).
 */
export async function compressPdfBuffer(
  inputBytes: Buffer,
  { quality = 85, maxDimension }: CompressPdfOptions = {},
): Promise<{ bytes: Buffer; scanPages: number; copiedPages: number }> {
  const parser = new PDFParse({ data: inputBytes });
  const srcDoc = await PDFDocument.load(inputBytes);
  const outDoc = await PDFDocument.create();
  let scanPages = 0;
  let copiedPages = 0;

  try {
    const info = await parser.getInfo({ parsePageInfo: true });
    const pageCount = info.total;

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const pageInfo = info.pages?.[pageNum - 1];
      const pageWidthPt = pageInfo?.width;
      const pageHeightPt = pageInfo?.height;

      const images = await parser.getImage({ partial: [pageNum], imageBuffer: true, imageDataUrl: false, imageThreshold: 0 });
      const pageImages = images.pages[0]?.images ?? [];
      const dominant = pageImages.slice().sort((a, b) => b.width * b.height - a.width * a.height)[0];

      // A full-page scan's aspect ratio closely matches the page's aspect ratio
      // (scanning software places it edge-to-edge). A stray figure/logo won't.
      let isScanPage = false;
      if (dominant && pageWidthPt && pageHeightPt && dominant.width > 200 && dominant.height > 200) {
        const pageAspect = pageWidthPt / pageHeightPt;
        const imageAspect = dominant.width / dominant.height;
        const aspectDelta = Math.abs(imageAspect - pageAspect) / pageAspect;
        isScanPage = aspectDelta <= SCAN_PAGE_ASPECT_TOLERANCE;
      }

      if (isScanPage && dominant) {
        let pipeline = sharp(Buffer.from(dominant.data));
        if (maxDimension && Math.max(dominant.width, dominant.height) > maxDimension) {
          pipeline = pipeline.resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true });
        }
        const recompressed = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
        const embedded = await outDoc.embedJpg(recompressed);
        const page = outDoc.addPage([pageWidthPt, pageHeightPt]);
        page.drawImage(embedded, { x: 0, y: 0, width: pageWidthPt, height: pageHeightPt });
        scanPages++;
      } else {
        const [copied] = await outDoc.copyPages(srcDoc, [pageNum - 1]);
        outDoc.addPage(copied);
        copiedPages++;
      }
    }
  } finally {
    await parser.destroy();
  }

  const bytes = Buffer.from(await outDoc.save());
  return { bytes, scanPages, copiedPages };
}
