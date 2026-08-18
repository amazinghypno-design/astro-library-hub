import { describe, expect, it } from "vitest";
import { fromEmbeddedInfo, fromFirstPageText, mergeSuggestions } from "./metadataExtraction";

describe("fromEmbeddedInfo", () => {
  it("accepts real-looking embedded title/author", () => {
    const result = fromEmbeddedInfo("พรหมชาติ", "เทพ สาริกบุตร");
    expect(result.title).toEqual({ value: "พรหมชาติ", confidence: "high" });
    expect(result.author).toEqual({ value: "เทพ สาริกบุตร", confidence: "high" });
  });

  it("rejects generic/noise titles like a default export name", () => {
    expect(fromEmbeddedInfo("Untitled", "").title).toBeNull();
    expect(fromEmbeddedInfo("Microsoft Word - x.doc", "").title).toBeNull();
  });

  it("returns null fields when nothing is embedded", () => {
    const result = fromEmbeddedInfo(undefined, undefined);
    expect(result.title).toBeNull();
    expect(result.author).toBeNull();
  });
});

describe("fromFirstPageText", () => {
  it("finds an explicit author line in Thai", () => {
    const text = "พรหมชาติ\nตำราโหราศาสตร์ไทยฉบับสมบูรณ์\nโดย เทพ สาริกบุตร\nพิมพ์ครั้งที่ 5";
    const result = fromFirstPageText(text);
    expect(result.author).toEqual({ value: "เทพ สาริกบุตร", confidence: "low" });
  });

  it("does not invent an author when there is no explicit label", () => {
    const text = "พรหมชาติ\nตำราโหราศาสตร์ไทย\nเทพ สาริกบุตร";
    const result = fromFirstPageText(text);
    expect(result.author).toBeNull();
  });

  it("takes the longest line as a low-confidence title guess", () => {
    const text = "พรหมชาติ\nตำราโหราศาสตร์ไทยฉบับสมบูรณ์ที่รวมเนื้อหาครบถ้วน";
    const result = fromFirstPageText(text);
    expect(result.title?.confidence).toBe("low");
    expect(result.title?.value).toContain("ตำราโหราศาสตร์ไทย");
  });

  it("returns null title for empty input", () => {
    expect(fromFirstPageText("").title).toBeNull();
  });
});

describe("mergeSuggestions", () => {
  it("prefers high-confidence embedded values over page-text guesses", () => {
    const primary = { title: { value: "Embedded Title", confidence: "high" as const }, author: null };
    const fallback = { title: { value: "Guessed Title", confidence: "low" as const }, author: { value: "Guessed Author", confidence: "low" as const } };
    const merged = mergeSuggestions(primary, fallback);
    expect(merged.title?.value).toBe("Embedded Title");
    expect(merged.author?.value).toBe("Guessed Author");
  });
});
