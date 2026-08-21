const STOPWORDS = new Set([
  // Thai particles/common words that carry no topical signal on their own
  "และ", "หรือ", "ที่", "ใน", "ของ", "เป็น", "มี", "ให้", "ได้", "จะ", "ไม่", "แล้ว", "กับ", "ก็", "นี้", "นั้น", "คือ", "ว่า", "อยู่", "ไป",
  "มา", "การ", "ความ", "อะไร", "ยังไง", "อย่างไร", "บ้าง", "ไหม", "หรือไม่", "ครับ", "คะ", "ค่ะ",
  // English stopwords (site may get mixed-language questions)
  "the", "a", "an", "is", "are", "was", "were", "of", "in", "on", "to", "and", "or", "what", "how", "why", "does", "do", "this", "that",
]);

/**
 * Phrases a reader wraps a question in that say nothing about the book's
 * subject. Thai is written without spaces, so these cannot be removed as
 * tokens the way English stopwords can — they are stripped from the string
 * before anything is matched, or every n-gram of "เล่มนี้พูดถึงอะไรบ้าง" goes
 * looking for the words "เล่มนี้" and "พูดถึง" inside an astrology manual and
 * finds nothing.
 */
const QUESTION_PHRASES = [
  "หนังสือเล่มนี้", "ในเล่มนี้", "เล่มนี้", "ในหนังสือ", "หนังสือ", "เอกสารนี้", "ไฟล์นี้",
  "พูดถึงเรื่อง", "พูดถึง", "กล่าวถึง", "เกี่ยวกับ", "อธิบาย", "บอกหน่อย", "ช่วยบอก", "ช่วย",
  "อะไรบ้าง", "อย่างไรบ้าง", "ยังไงบ้าง", "มีอะไร", "คืออะไร", "หมายถึงอะไร", "ทำไม", "เมื่อไหร่",
  "หน่อย", "ได้ไหม", "ไหม", "ครับ", "ค่ะ", "คะ",
];

function stripQuestionPhrases(question: string): string {
  return QUESTION_PHRASES.reduce((acc, phrase) => acc.split(phrase).join(" "), question);
}

function extractKeywords(question: string): string[] {
  const raw = question
    .toLowerCase()
    .split(/[\s,.!?"'“”‘’()[\]{}:;/\\|—–\-๏ฯๆ]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return Array.from(new Set(raw));
}

/**
 * Thai script has no spaces between words, so a naive substring match on
 * whitespace-split tokens (extractKeywords above) under-recalls for
 * multi-word runs typed without spaces. Character n-grams give a
 * space-agnostic fallback signal without needing a real word-segmentation
 * dependency — weighted lower than exact token hits since it's fuzzier.
 */
function charNGrams(s: string, n = 4): string[] {
  const compact = s.toLowerCase().replace(/\s+/g, "");
  if (compact.length < n) return compact ? [compact] : [];
  const grams: string[] = [];
  for (let i = 0; i <= compact.length - n; i++) grams.push(compact.slice(i, i + n));
  return grams;
}

/**
 * A spread of the book — its opening plus evenly spaced samples from the rest.
 * Used when nothing in the text matches the question's wording, which is the
 * normal case for a question about the book as a whole ("เล่มนี้พูดถึงอะไรบ้าง"
 * shares no words with the astrology inside it). The answer still comes only
 * from the book's own text; without this the reader got "ไม่พบข้อมูลนี้ในเล่มนี้"
 * for every general question, which read as the feature being broken.
 */
export function selectOverviewPassages(fullText: string, options: SelectPassagesOptions = {}): string[] {
  const { maxPassages = 4, maxTotalChars = 6000, chunkSize = 900, overlap = 150 } = options;
  const chunks = chunkText(fullText, chunkSize, overlap);
  if (chunks.length === 0) return [];

  const wanted = Math.min(maxPassages, chunks.length);
  const step = chunks.length / wanted;
  const picked: string[] = [];
  let totalChars = 0;
  for (let i = 0; i < wanted; i++) {
    const chunk = chunks[Math.floor(i * step)];
    if (totalChars + chunk.length > maxTotalChars && picked.length > 0) break;
    picked.push(chunk);
    totalChars += chunk.length;
  }
  return picked;
}

export function chunkText(text: string, chunkSize = 900, overlap = 150): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  if (cleaned.length <= chunkSize) return [cleaned];

  const chunks: string[] = [];
  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    chunks.push(cleaned.slice(start, end));
    if (end >= cleaned.length) break;
    start = end - overlap;
  }
  return chunks;
}

export interface SelectPassagesOptions {
  maxPassages?: number;
  maxTotalChars?: number;
  chunkSize?: number;
  overlap?: number;
}

/**
 * Ranks chunks of a book's extracted text by relevance to a question using
 * plain keyword/n-gram overlap — no embeddings/vector DB needed at this
 * scale. Returns [] when nothing scores above zero; the caller then falls
 * back to selectOverviewPassages so a question about the book as a whole
 * still gets answered from the book's own text (see routers/library.ts
 * askBook). Either way the AI only ever sees text from this file.
 */
export function selectRelevantPassages(fullText: string, question: string, options: SelectPassagesOptions = {}): string[] {
  const { maxPassages = 4, maxTotalChars = 6000, chunkSize = 900, overlap = 150 } = options;

  const topical = stripQuestionPhrases(question);
  const keywords = extractKeywords(topical);
  // Two n-gram widths: the shorter one recalls a Thai word buried in a longer
  // run, the longer one is specific enough to be worth more when it does hit.
  const ngrams = [...charNGrams(topical, 3).map((g) => ({ g, weight: 1 })), ...charNGrams(topical, 5).map((g) => ({ g, weight: 2 }))];
  if (keywords.length === 0 && ngrams.length === 0) return [];

  const chunks = chunkText(fullText, chunkSize, overlap);
  const scored = chunks.map((text) => {
    const lower = text.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      let idx = lower.indexOf(kw);
      while (idx !== -1) {
        score += 3;
        idx = lower.indexOf(kw, idx + kw.length);
      }
    }
    for (const { g, weight } of ngrams) {
      if (lower.includes(g)) score += weight;
    }
    return { text, score };
  });

  const ranked = scored.filter((p) => p.score > 0).sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return [];

  const selected: string[] = [];
  let totalChars = 0;
  for (const p of ranked) {
    if (selected.length >= maxPassages) break;
    if (totalChars + p.text.length > maxTotalChars && selected.length > 0) break;
    selected.push(p.text);
    totalChars += p.text.length;
  }
  return selected;
}
