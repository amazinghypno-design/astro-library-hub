import { describe, expect, it } from "vitest";
import { isOcrableImage, isTextLayerThin } from "./needsOcr";

describe("isTextLayerThin", () => {
  it("treats an empty text layer as thin", () => {
    expect(isTextLayerThin("", 10)).toBe(true);
    expect(isTextLayerThin(null, 10)).toBe(true);
    expect(isTextLayerThin(undefined, null)).toBe(true);
  });

  it("does not count whitespace as text", () => {
    expect(isTextLayerThin("\n\n   \t\n".repeat(200), 3)).toBe(true);
  });

  it("treats a scan carrying only a header stamp as thin", () => {
    // 40 pages, one scanner header line — the case a plain emptiness check misses.
    expect(isTextLayerThin("สแกนโดยห้องสมุด หน้า 1 จาก 40", 40)).toBe(true);
  });

  it("treats a real typeset book as not thin", () => {
    const page = "โหราศาสตร์ไทยเบื้องต้น ".repeat(30); // ~660 chars per page
    expect(isTextLayerThin(page.repeat(40), 40)).toBe(false);
  });

  it("judges by text per page, not by total length", () => {
    const perPage = "ก".repeat(100);
    // The same 60,000 characters is plenty over 12 pages and thin over 600.
    expect(isTextLayerThin(perPage.repeat(600), 12)).toBe(false);
    expect(isTextLayerThin(perPage.repeat(600), 600)).toBe(true);
  });

  it("falls back to one page when the page count is unknown", () => {
    expect(isTextLayerThin("ก".repeat(500), null)).toBe(false);
    expect(isTextLayerThin("ก".repeat(50), null)).toBe(true);
  });
});

describe("isOcrableImage", () => {
  it("accepts the raster formats this library actually holds", () => {
    expect(isOcrableImage("image/png")).toBe(true);
    expect(isOcrableImage("image/jpeg")).toBe(true);
    expect(isOcrableImage("IMAGE/PNG")).toBe(true);
  });

  it("rejects everything that is not a raster image", () => {
    expect(isOcrableImage("application/pdf")).toBe(false);
    expect(isOcrableImage("image/svg+xml")).toBe(false);
    expect(isOcrableImage("text/plain")).toBe(false);
  });
});
