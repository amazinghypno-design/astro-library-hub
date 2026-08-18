import { PDFParse } from "pdf-parse";
import { pageOrientationFromDimensions, type PageOrientation } from "../domain/classifyDocumentType";

export interface PdfInspection {
  embeddedTitle?: string;
  embeddedAuthor?: string;
  firstPageText: string;
  /** Full extracted text, capped at MAX_PAGES_FOR_FULL_TEXT — used later for the per-book Q&A feature (Phase 8c). */
  fullText: string;
  pageCount: number;
  /** Derived from page-1 dimensions; undefined only if page-1 geometry couldn't be read. */
  pageOrientation?: PageOrientation;
}

const MAX_PAGES_FOR_FULL_TEXT = 400;

export async function inspectPdf(buffer: Buffer): Promise<PdfInspection> {
  const parser = new PDFParse({ data: buffer });
  try {
    const info = await parser.getInfo({ parsePageInfo: true, partial: [1] });
    const firstPage = await parser.getText({ first: 1 });
    const pageCount = info.total;

    const fullTextResult =
      pageCount <= MAX_PAGES_FOR_FULL_TEXT ? await parser.getText() : await parser.getText({ first: MAX_PAGES_FOR_FULL_TEXT });

    const firstPageInfo = info.pages?.[0];
    const pageOrientation = firstPageInfo
      ? pageOrientationFromDimensions(firstPageInfo.width, firstPageInfo.height)
      : undefined;

    return {
      embeddedTitle: info.info?.Title,
      embeddedAuthor: info.info?.Author,
      firstPageText: firstPage.getPageText(1) ?? "",
      fullText: fullTextResult.text,
      pageCount,
      pageOrientation,
    };
  } finally {
    await parser.destroy();
  }
}
