import { describe, expect, it } from "vitest";
import { defaultStatusForNewUpload, isPubliclyVisible, visibilityForStatus } from "./publicationPolicy";

describe("visibilityForStatus", () => {
  it("published is public", () => {
    expect(visibilityForStatus("published")).toBe("public");
  });
  it("draft is private", () => {
    expect(visibilityForStatus("draft")).toBe("private");
  });
  it("archived is private", () => {
    expect(visibilityForStatus("archived")).toBe("private");
  });
});

describe("defaultStatusForNewUpload", () => {
  it("defaults to published when title and category are present", () => {
    expect(defaultStatusForNewUpload({ hasTitle: true, hasCategoryId: true })).toBe("published");
  });
  it("defaults to draft when category is missing", () => {
    expect(defaultStatusForNewUpload({ hasTitle: true, hasCategoryId: false })).toBe("draft");
  });
  it("defaults to draft when title is missing", () => {
    expect(defaultStatusForNewUpload({ hasTitle: false, hasCategoryId: true })).toBe("draft");
  });
});

describe("isPubliclyVisible", () => {
  it("requires both published status and public visibility", () => {
    expect(isPubliclyVisible("published", "public")).toBe(true);
    expect(isPubliclyVisible("published", "private")).toBe(false);
    expect(isPubliclyVisible("draft", "public")).toBe(false);
    expect(isPubliclyVisible("archived", "public")).toBe(false);
  });
});
