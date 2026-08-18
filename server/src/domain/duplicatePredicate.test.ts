import { describe, expect, it } from "vitest";
import { findDuplicate, normalizeForDuplicateCheck } from "./duplicatePredicate";

describe("normalizeForDuplicateCheck", () => {
  it("lowercases, trims and collapses whitespace", () => {
    expect(normalizeForDuplicateCheck("  Deep   Space   ")).toBe("deep space");
  });

  it("strips a trailing file extension", () => {
    expect(normalizeForDuplicateCheck("คัมภีร์จักร.PDF")).toBe(normalizeForDuplicateCheck("คัมภีร์จักร"));
  });
});

describe("findDuplicate", () => {
  const existing = [
    { id: "file-1", title: "โหราศาสตร์ไทย", originalName: "thai-astro.pdf", categoryId: "cat-a" },
  ];

  it("matches on normalized title within the same category", () => {
    const result = findDuplicate("  โหราศาสตร์ไทย  ", "different-name.pdf", "cat-a", existing);
    expect(result).toEqual({
      existingFileId: "file-1",
      existingFileName: "thai-astro.pdf",
      existingTitle: "โหราศาสตร์ไทย",
    });
  });

  it("matches on normalized original filename within the same category", () => {
    const result = findDuplicate("Different Title", "Thai-Astro.PDF", "cat-a", existing);
    expect(result?.existingFileId).toBe("file-1");
  });

  it("does not match across different categories", () => {
    const result = findDuplicate("โหราศาสตร์ไทย", "thai-astro.pdf", "cat-b", existing);
    expect(result).toBeNull();
  });

  it("returns null when nothing matches", () => {
    const result = findDuplicate("Totally new book", "new-book.pdf", "cat-a", existing);
    expect(result).toBeNull();
  });
});
