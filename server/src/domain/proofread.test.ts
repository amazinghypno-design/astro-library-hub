import { describe, expect, it } from "vitest";
import { chunkForProofreading, mergeFixes, parseProofreadFixes } from "./proofread";

describe("parseProofreadFixes", () => {
  const source = "วันนี้อากาศดีมาก ผมจะไปเรียนโหราศษสตร์ที่ห้องสมุด";

  it("reads the documented shape", () => {
    const raw = JSON.stringify({ fixes: [{ wrong: "โหราศษสตร์", right: "โหราศาสตร์", reason: "สะกดผิด" }] });
    expect(parseProofreadFixes(raw, source)).toEqual([
      { wrong: "โหราศษสตร์", right: "โหราศาสตร์", reason: "สะกดผิด" },
    ]);
  });

  it("digs the JSON out of a fenced or chatty reply", () => {
    const fenced = '```json\n{"fixes":[{"wrong":"โหราศษสตร์","right":"โหราศาสตร์","reason":"สะกดผิด"}]}\n```';
    const chatty = 'นี่คือผลการตรวจครับ [{"wrong":"โหราศษสตร์","right":"โหราศาสตร์","reason":"สะกดผิด"}] จบ';
    expect(parseProofreadFixes(fenced, source)).toHaveLength(1);
    expect(parseProofreadFixes(chatty, source)).toHaveLength(1);
  });

  // The reason the model is asked for replacements rather than a rewritten
  // page: a correction to a word nobody wrote must never reach the document.
  it("drops a fix whose wrong half is not in the text", () => {
    const raw = JSON.stringify({ fixes: [{ wrong: "ดาราศาสตร", right: "ดาราศาสตร์", reason: "การันต์" }] });
    expect(parseProofreadFixes(raw, source)).toEqual([]);
  });

  it("drops matches too short to be a word", () => {
    const raw = JSON.stringify({ fixes: [{ wrong: "ก", right: "ข", reason: "" }] });
    expect(parseProofreadFixes(raw, "กขค")).toEqual([]);
  });

  it("drops a fix that changes nothing, and repeats of the same word", () => {
    const raw = JSON.stringify({
      fixes: [
        { wrong: "อากาศ", right: "อากาศ", reason: "" },
        { wrong: "โหราศษสตร์", right: "โหราศาสตร์", reason: "หนึ่ง" },
        { wrong: "โหราศษสตร์", right: "โหราศาตร์", reason: "สอง" },
      ],
    });
    expect(parseProofreadFixes(raw, source)).toEqual([
      { wrong: "โหราศษสตร์", right: "โหราศาสตร์", reason: "หนึ่ง" },
    ]);
  });

  it("survives junk without throwing", () => {
    expect(parseProofreadFixes("ไม่พบคำผิดครับ", source)).toEqual([]);
    expect(parseProofreadFixes("", source)).toEqual([]);
    expect(parseProofreadFixes('{"fixes":[null,3,{"wrong":123}]}', source)).toEqual([]);
  });

  it("keeps a deletion, which is how a doubled word is fixed", () => {
    const doubled = "ผมจะไป ไป เรียน";
    const raw = JSON.stringify({ fixes: [{ wrong: " ไป ", right: " ", reason: "คำซ้ำ" }] });
    expect(parseProofreadFixes(raw, doubled)).toHaveLength(1);
  });
});

describe("chunkForProofreading", () => {
  it("keeps a short page in one request", () => {
    expect(chunkForProofreading("บรรทัดหนึ่ง\nบรรทัดสอง")).toEqual(["บรรทัดหนึ่ง\nบรรทัดสอง"]);
  });

  it("cuts on line boundaries and stays under the limit", () => {
    const text = Array.from({ length: 20 }, (_, i) => `บรรทัดที่ ${i} `.repeat(20)).join("\n");
    const chunks = chunkForProofreading(text, 500, 10);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(500);
  });

  it("splits a single paragraph longer than one request", () => {
    const chunks = chunkForProofreading("ก".repeat(1200), 500, 10);
    expect(chunks).toEqual(["ก".repeat(500), "ก".repeat(500), "ก".repeat(200)]);
  });

  it("stops at the request budget rather than checking a book", () => {
    const text = Array.from({ length: 50 }, () => "ก".repeat(400)).join("\n");
    expect(chunkForProofreading(text, 500, 3)).toHaveLength(3);
  });

  it("has nothing to check in an empty page", () => {
    expect(chunkForProofreading("   \n  \n")).toEqual([]);
  });
});

describe("mergeFixes", () => {
  it("keeps the first ruling on each word", () => {
    const merged = mergeFixes([
      [{ wrong: "ก1", right: "ก", reason: "หนึ่ง" }],
      [
        { wrong: "ก1", right: "กก", reason: "สอง" },
        { wrong: "ข2", right: "ข", reason: "สาม" },
      ],
    ]);
    expect(merged.map((f) => f.wrong)).toEqual(["ก1", "ข2"]);
    expect(merged[0].reason).toBe("หนึ่ง");
  });
});

describe("the library's own vocabulary", () => {
  // Seen for real on the first live run: the model offered ทักษา → ทักษะ.
  it("refuses to 'correct' a Thai astrology term", () => {
    const source = "วันนี้เรียนเรื่องทักษาและการอ่านปีจร";
    const raw = JSON.stringify({
      fixes: [
        { wrong: "ทักษา", right: "ทักษะ", reason: "สะกดผิด" },
        { wrong: "ปีจร", right: "ปัจจุบัน", reason: "สะกดผิด" },
      ],
    });
    expect(parseProofreadFixes(raw, source)).toEqual([]);
  });

  it("still fixes a misspelling of a protected term", () => {
    const source = "วิชาโหราศษสตร์";
    const raw = JSON.stringify({ fixes: [{ wrong: "โหราศษสตร์", right: "โหราศาสตร์", reason: "สะกดผิด" }] });
    expect(parseProofreadFixes(raw, source)).toHaveLength(1);
  });
});
