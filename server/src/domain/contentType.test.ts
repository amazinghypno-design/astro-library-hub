import { describe, expect, it } from "vitest";
import { storageContentType } from "./contentType";

describe("storageContentType", () => {
  it("appends charset=utf-8 to text/* types missing a charset", () => {
    expect(storageContentType("text/plain")).toBe("text/plain; charset=utf-8");
    expect(storageContentType("text/markdown")).toBe("text/markdown; charset=utf-8");
  });

  it("leaves an explicit charset alone", () => {
    expect(storageContentType("text/plain; charset=iso-8859-1")).toBe("text/plain; charset=iso-8859-1");
  });

  it("leaves non-text types untouched", () => {
    expect(storageContentType("application/pdf")).toBe("application/pdf");
    expect(storageContentType("image/png")).toBe("image/png");
  });
});
