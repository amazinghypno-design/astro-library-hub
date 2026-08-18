import { describe, expect, it } from "vitest";
import { classifyDocumentType, pageOrientationFromDimensions } from "./classifyDocumentType";

describe("classifyDocumentType", () => {
  it("classifies a portrait PDF as ebook", () => {
    expect(classifyDocumentType("application/pdf", "book.pdf", "portrait")).toBe("ebook");
  });

  it("classifies a landscape PDF as slide", () => {
    expect(classifyDocumentType("application/pdf", "deck.pdf", "landscape")).toBe("slide");
  });

  it("defaults a PDF with unknown orientation to ebook, not slide", () => {
    expect(classifyDocumentType("application/pdf", "unknown.pdf")).toBe("ebook");
  });

  it("classifies spreadsheets regardless of a PDF-like name", () => {
    expect(classifyDocumentType("application/vnd.ms-excel", "data.xls")).toBe("spreadsheet");
    expect(classifyDocumentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "data.xlsx")).toBe("spreadsheet");
  });

  it("classifies word-processing documents as document", () => {
    expect(classifyDocumentType("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "report.docx")).toBe(
      "document",
    );
    expect(classifyDocumentType("text/plain", "notes.txt")).toBe("document");
  });

  it("never auto-assigns poster — no reliable signal for it", () => {
    expect(classifyDocumentType("application/pdf", "poster.pdf", "landscape")).not.toBe("poster");
    expect(classifyDocumentType("image/png", "poster.png")).not.toBe("poster");
  });

  it("falls back to other for unrecognized types", () => {
    expect(classifyDocumentType("application/zip", "archive.zip")).toBe("other");
  });
});

describe("pageOrientationFromDimensions", () => {
  it("wider than tall is landscape", () => {
    expect(pageOrientationFromDimensions(1000, 700)).toBe("landscape");
  });

  it("taller than wide is portrait", () => {
    expect(pageOrientationFromDimensions(700, 1000)).toBe("portrait");
  });

  it("near-square counts as portrait (tolerance)", () => {
    expect(pageOrientationFromDimensions(1000, 990)).toBe("portrait");
  });
});
