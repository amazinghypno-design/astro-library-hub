/**
 * Proofreading a page of Thai: turning what the model says into a list of
 * changes safe enough to apply to somebody's own writing.
 *
 * The model is asked for *replacements* — "this exact run of characters
 * should be that one" — and never for a rewritten copy of the page. That
 * choice is the whole design. A rewritten page cannot be shown as "here is
 * what I would change": the diff would have to be guessed back out of it,
 * formatting would be lost on the way through, and a model quietly improving
 * a sentence it was not asked to touch would be indistinguishable from a
 * spelling fix. A list of replacements can be highlighted where each one sits,
 * counted, refused one by one, and applied without the rest of the page ever
 * being rewritten.
 *
 * Nothing here trusts the reply. Everything the model sends is checked
 * against the text it was given, and anything that does not literally appear
 * there is dropped — a "correction" whose `wrong` half is not in the document
 * cannot be applied to the document, and one the model imagined is exactly
 * how a proofreader would come to change a word nobody wrote.
 */

export interface ProofreadFix {
  /** Exactly as it appears in the text — this is what gets searched for. */
  wrong: string;
  /** What to put in its place. Empty means "delete this" (a doubled word). */
  right: string;
  /** A few words of Thai explaining the change, for the reader to judge it by. */
  reason: string;
}

export const PROOFREAD_SYSTEM_PROMPT = `คุณเป็นเครื่องพิสูจน์อักษรภาษาไทยที่แม่นยำและระมัดระวังมาก

หน้าที่ของคุณคือหา "คำที่สะกดผิด" ในข้อความที่ได้รับ แล้วส่งกลับเป็นรายการคำแก้เท่านั้น

สิ่งที่ให้แก้:
- คำสะกดผิด พิมพ์ตกหล่น สลับตัวอักษร
- วรรณยุกต์ผิด (เช่น เอก โท ตรี จัตวา ผิดตำแหน่ง)
- สระผิด ตัวการันต์ผิด ตัวสะกดผิด
- คำที่พิมพ์ซ้ำติดกันโดยไม่ตั้งใจ (ให้ "right" เป็นคำเดียว)

สิ่งที่ห้ามแตะเด็ดขาด:
- ห้ามเรียบเรียงประโยคใหม่ ห้ามเปลี่ยนสำนวน ห้ามเปลี่ยนความหมาย ห้ามเพิ่มหรือตัดเนื้อหา
- ห้ามแก้ชื่อคน ชื่อเฉพาะ ศัพท์เทคนิค คำทับศัพท์ภาษาอังกฤษ
- ห้ามแก้คำที่เขียนถูกอยู่แล้วแต่คุณไม่คุ้น — ถ้าไม่มั่นใจ 100% ให้ข้ามไป
- ห้ามแก้เครื่องหมายวรรคตอนหรือการเว้นวรรค นอกจากเป็นคำที่ติดกันจนอ่านไม่ออก

สำคัญมาก — ข้อความนี้เป็นบันทึกวิชาโหราศาสตร์ไทยและศัพท์บาลีสันสกฤต ศัพท์เฉพาะเหล่านี้สะกดถูกอยู่แล้วเสมอ ห้ามแก้:
ทักษา ทักษาปกรณ์ ลัคนา ลัคน์ ราศี ภพ ตนุ กดุมภะ สหัชชะ พันธุ ปุตตะ อริ ปัตนิ มรณะ ศุภะ กัมมะ ลาภะ วินาศ
ทศา มหาทศา อันตรทศา ฤกษ์ ยาม นวางค์ ตรียางค์ เกษตร อุจจ์ นิจ ประ มหาจักร โยค ปีจร จร เกณฑ์ชะตา เรือนชะตา
พินทุบาทว์ อัฏฐเคราะห์ ธาตุ ดิถี ปักษ์ อธิบดี บริวาร อายุ เดช ศรี มูละ อุตสาหะ มนตรี กาลกิณี
(รวมถึงศัพท์โหราศาสตร์ ศัพท์บาลี ศัพท์สันสกฤตอื่นๆ ที่ไม่ได้อยู่ในรายการนี้ด้วย)

รูปแบบคำตอบ: ตอบเป็น JSON อย่างเดียว ห้ามมีคำอธิบายอื่นนอก JSON
{"fixes":[{"wrong":"คำผิดที่คัดลอกมาจากข้อความตรงตัวทุกตัวอักษร","right":"คำที่ถูกต้อง","reason":"เหตุผลสั้นๆ ไม่เกิน 10 คำ"}]}

กฎสำคัญที่สุด: ค่า "wrong" ต้องคัดลอกมาจากข้อความต้นฉบับแบบตรงตัวทุกตัวอักษร ห้ามพิมพ์ใหม่เอง
ถ้าไม่พบคำผิดเลย ให้ตอบ {"fixes":[]}`;

/**
 * Words a general-purpose model reliably tries to "correct" and must not.
 *
 * This library is Thai astrology, and a model that has read far more ordinary
 * Thai than astrological Thai treats its vocabulary as typos: the first live
 * run of this feature offered to change ทักษา (a real term — the eight-house
 * system) into ทักษะ, "skill". The system prompt says not to, and the prompt
 * is not enough on its own, so the words that matter most are also refused
 * here where no wording can talk the check out of it.
 *
 * Matched whole, against `wrong` alone: a fix *to* one of these is a
 * misspelling of it and does not equal it, so genuine corrections still get
 * through. The list is deliberately short and specific — it is a guard for
 * this library's own vocabulary, not a Thai dictionary.
 */
const PROTECTED_TERMS = new Set([
  "ทักษา", "ทักษาปกรณ์", "ลัคนา", "ลัคน์", "ราศี", "ภพ", "ตนุ", "กดุมภะ", "สหัชชะ", "พันธุ",
  "ปุตตะ", "อริ", "ปัตนิ", "มรณะ", "ศุภะ", "กัมมะ", "ลาภะ", "วินาศ", "ทศา", "มหาทศา",
  "อันตรทศา", "ฤกษ์", "ยาม", "นวางค์", "ตรียางค์", "เกษตร", "อุจจ์", "นิจ", "มหาจักร", "โยค",
  "ปีจร", "จร", "เกณฑ์ชะตา", "เรือนชะตา", "พินทุบาทว์", "อัฏฐเคราะห์", "ธาตุ", "ดิถี", "ปักษ์",
  "อธิบดี", "บริวาร", "อายุ", "เดช", "ศรี", "มูละ", "อุตสาหะ", "มนตรี", "กาลกิณี", "ชะตา", "ดวงชะตา",
]);

/** Longest run of characters sent to the model in one request. */
const CHUNK_CHARS = 3500;
/** Requests per check. Five is a long note; past that the reader is told. */
const MAX_CHUNKS = 5;
/** A `wrong` shorter than this matches half the page — always a mistake. */
const MIN_WRONG_CHARS = 2;
const MAX_WRONG_CHARS = 60;
const MAX_RIGHT_CHARS = 120;
const MAX_REASON_CHARS = 120;
const MAX_FIXES = 200;

/**
 * Splits a page into request-sized pieces on paragraph boundaries, so a fix
 * is never asked for across a cut. Returns at most MAX_CHUNKS: the rest of a
 * very long page goes unchecked, and the caller says so rather than pretending
 * the whole page was read.
 */
export function chunkForProofreading(text: string, chunkChars = CHUNK_CHARS, maxChunks = MAX_CHUNKS): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const line of text.split("\n")) {
    // A single paragraph longer than a whole chunk is split on its own — rare
    // in a note, but it must not silently disappear.
    if (line.length > chunkChars) {
      if (current.trim()) chunks.push(current);
      current = "";
      for (let i = 0; i < line.length; i += chunkChars) {
        chunks.push(line.slice(i, i + chunkChars));
        if (chunks.length >= maxChunks) return chunks.slice(0, maxChunks);
      }
      continue;
    }
    if (current.length + line.length + 1 > chunkChars) {
      if (current.trim()) chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
    if (chunks.length >= maxChunks) return chunks.slice(0, maxChunks);
  }

  if (current.trim()) chunks.push(current);
  return chunks.slice(0, maxChunks);
}

/** Pulls the JSON out of a reply that may be fenced, prefixed or chatty. */
function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall through: the model wrapped the JSON in a sentence.
  }
  const start = cleaned.search(/[[{]/);
  if (start === -1) return null;
  const open = cleaned[start];
  const close = open === "[" ? "]" : "}";
  const end = cleaned.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function toEntries(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    for (const key of ["fixes", "corrections", "results", "items"]) {
      const value = (parsed as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

/**
 * Validates a reply against the text it was about, and returns only the fixes
 * that can actually be carried out.
 *
 * A fix survives when its `wrong` half appears verbatim in `source`, is long
 * enough not to match half the page, and actually differs from `right`.
 * Everything else — invented words, whole rewritten sentences, single
 * characters, an entry that is not even an object — is dropped in silence:
 * there is nothing the reader could do with it.
 */
export function parseProofreadFixes(raw: string, source: string): ProofreadFix[] {
  const entries = toEntries(extractJson(raw));
  const fixes: ProofreadFix[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const wrong = typeof record.wrong === "string" ? record.wrong.trim() : "";
    const right = typeof record.right === "string" ? record.right.trim() : "";
    const reason = typeof record.reason === "string" ? record.reason.trim().slice(0, MAX_REASON_CHARS) : "";

    if (wrong.length < MIN_WRONG_CHARS || wrong.length > MAX_WRONG_CHARS) continue;
    if (right.length > MAX_RIGHT_CHARS) continue;
    if (wrong === right) continue;
    // The one rule that keeps a hallucinated correction off the page.
    if (!source.includes(wrong)) continue;
    // …and the one that keeps this library's own vocabulary out of its way.
    if (PROTECTED_TERMS.has(wrong)) continue;
    if (seen.has(wrong)) continue;

    seen.add(wrong);
    fixes.push({ wrong, right, reason });
    if (fixes.length >= MAX_FIXES) break;
  }

  return fixes;
}

/** Merges the per-chunk results of one check, keeping the first of each word. */
export function mergeFixes(batches: ProofreadFix[][]): ProofreadFix[] {
  const seen = new Set<string>();
  const merged: ProofreadFix[] = [];
  for (const batch of batches) {
    for (const fix of batch) {
      if (seen.has(fix.wrong)) continue;
      seen.add(fix.wrong);
      merged.push(fix);
      if (merged.length >= MAX_FIXES) return merged;
    }
  }
  return merged;
}
