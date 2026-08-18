import { describe, expect, it } from "vitest";
import { previewCapability } from "./previewCapability";

describe("previewCapability", () => {
  it("classifies PDF as inline", () => {
    expect(previewCapability("application/pdf", "book.pdf")).toBe("pdf-inline");
  });

  it("classifies common images as inline", () => {
    expect(previewCapability("image/png", "chart.png")).toBe("image-inline");
    expect(previewCapability("image/jpeg", "chart.jpg")).toBe("image-inline");
  });

  it("classifies plain text as inline", () => {
    expect(previewCapability("text/plain", "notes.txt")).toBe("text-inline");
  });

  it("classifies modern .docx as inline (rendered server-side via mammoth)", () => {
    expect(
      previewCapability(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "รายงาน.docx",
      ),
    ).toBe("docx-inline");
  });

  it("classifies .xlsx and legacy .xls as inline (rendered server-side via SheetJS)", () => {
    expect(
      previewCapability("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "data.xlsx"),
    ).toBe("xlsx-inline");
    expect(previewCapability("application/vnd.ms-excel", "data.xls")).toBe("xlsx-inline");
  });

  it("classifies legacy binary .doc and PowerPoint as download-fallback (no renderer yet)", () => {
    expect(previewCapability("application/msword", "report.doc")).toBe("download-fallback");
    expect(
      previewCapability(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "slides.pptx",
      ),
    ).toBe("download-fallback");
  });

  it("falls back to extension when MIME is generic/unknown but extension is a supported Office type", () => {
    expect(previewCapability("application/octet-stream", "รายงาน.xlsx")).toBe("xlsx-inline");
    expect(previewCapability("application/octet-stream", "รายงาน.docx")).toBe("docx-inline");
  });

  it("classifies genuinely unknown types as unsupported", () => {
    expect(previewCapability("application/x-weird-format", "file.xyz")).toBe("unsupported");
  });

  it("is case-insensitive on MIME type", () => {
    expect(previewCapability("APPLICATION/PDF", "book.pdf")).toBe("pdf-inline");
  });
});
