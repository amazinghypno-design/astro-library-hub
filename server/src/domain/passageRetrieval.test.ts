import { describe, expect, it } from "vitest";
import { chunkText, selectOverviewPassages, selectRelevantPassages } from "./passageRetrieval";

describe("chunkText", () => {
  it("returns the whole text as one chunk when under the size limit", () => {
    expect(chunkText("hello world", 900, 150)).toEqual(["hello world"]);
  });

  it("returns [] for empty/whitespace-only text", () => {
    expect(chunkText("", 900, 150)).toEqual([]);
    expect(chunkText("   \n  ", 900, 150)).toEqual([]);
  });

  it("splits long text into overlapping chunks that together cover the source", () => {
    const text = "a".repeat(2000);
    const chunks = chunkText(text, 900, 150);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[chunks.length - 1].endsWith("a")).toBe(true);
  });
});

describe("selectRelevantPassages", () => {
  const book = [
    "บทที่หนึ่ง ว่าด้วยเลข 7 ตัว 9 ฐาน เป็นศาสตร์การพยากรณ์โบราณของไทยที่ใช้ตัวเลขวันเดือนปีเกิดมาคำนวณ ",
    "บทที่สอง ว่าด้วยการดูลายมือ ซึ่งเป็นศาสตร์คนละแขนงจากเลข 7 ตัว 9 ฐานโดยสิ้นเชิง ",
    "บทที่สาม สรุปแนวทางการนำไปใช้ในชีวิตประจำวัน",
  ].join("\n\n");

  it("returns [] when the question shares no keywords with the text", () => {
    expect(selectRelevantPassages(book, "xyz123")).toEqual([]);
  });

  it("finds the passage containing the asked-about topic", () => {
    const result = selectRelevantPassages(book, "เลข 7 ตัว 9 ฐาน คืออะไร");
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((p) => p.includes("เลข 7 ตัว 9 ฐาน"))).toBe(true);
  });

  it("caps the number of passages returned", () => {
    const bigBook = Array.from({ length: 20 }, (_, i) => `ส่วนที่ ${i} พูดถึงแมว`).join("\n\n".repeat(50));
    const result = selectRelevantPassages(bigBook, "แมว", { maxPassages: 2, chunkSize: 50, overlap: 10 });
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("caps total returned character budget", () => {
    const bigBook = "แมวชอบเล่น ".repeat(2000);
    const result = selectRelevantPassages(bigBook, "แมว", { maxTotalChars: 500, chunkSize: 400, overlap: 50 });
    const total = result.reduce((sum, p) => sum + p.length, 0);
    // allows the first passage through even if it alone exceeds the budget,
    // but must not keep piling on more after that
    expect(result.length).toBeLessThanOrEqual(2);
    expect(total).toBeLessThan(1000);
  });

  it("does not go looking for the wrapper words of a general question", () => {
    // Written as Thai is written, without spaces: the whole thing is one
    // token, and every word in it is about asking, not about astrology. The
    // caller answers these from selectOverviewPassages instead.
    expect(selectRelevantPassages(book, "เล่มนี้พูดถึงอะไรบ้าง")).toEqual([]);
  });

  it("still matches a topic asked about without spaces", () => {
    const result = selectRelevantPassages(book, "ลายมือคืออะไร");
    expect(result.some((p) => p.includes("ลายมือ"))).toBe(true);
  });
});

describe("selectOverviewPassages", () => {
  const book = Array.from({ length: 12 }, (_, i) => `บทที่ ${i} ${"เนื้อหา".repeat(60)}`).join("\n\n");

  it("samples across the whole book, starting at the beginning", () => {
    const result = selectOverviewPassages(book, { maxPassages: 4 });
    expect(result.length).toBe(4);
    expect(book.indexOf(result[0])).toBe(0);
    // spread out rather than four neighbouring chunks
    expect(book.indexOf(result[3])).toBeGreaterThan(book.indexOf(result[1]));
  });

  it("returns [] for an empty book", () => {
    expect(selectOverviewPassages("")).toEqual([]);
  });

  it("never returns more passages than the book has chunks", () => {
    expect(selectOverviewPassages("สั้นมาก", { maxPassages: 4 }).length).toBe(1);
  });
});
