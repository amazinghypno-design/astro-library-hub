import { describe, expect, it } from "vitest";
import { checkChecksum, checkRawSize } from "./uploadGuards";

const limits = { maxRawBytes: 100 };

describe("checkRawSize", () => {
  it("passes under the limit", () => {
    expect(checkRawSize(50, limits)).toEqual({ ok: true });
  });
  it("fails over the limit with a stable code", () => {
    expect(checkRawSize(101, limits)).toEqual({ ok: false, code: "RAW_SIZE_LIMIT" });
  });
});

describe("checkChecksum", () => {
  it("is case-insensitive but exact otherwise", () => {
    expect(checkChecksum("ABCD1234", "abcd1234")).toEqual({ ok: true });
    expect(checkChecksum("abcd1234", "abcd0000")).toEqual({ ok: false, code: "CHECKSUM_MISMATCH" });
  });
});
