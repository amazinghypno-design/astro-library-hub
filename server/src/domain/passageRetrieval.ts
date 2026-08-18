const STOPWORDS = new Set([
  // Thai particles/common words that carry no topical signal on their own
  "และ", "หรือ", "ที่", "ใน", "ของ", "เป็น", "มี", "ให้", "ได้", "จะ", "ไม่", "แล้ว", "กับ", "ก็", "นี้", "นั้น", "คือ", "ว่า", "อยู่", "ไป",
  "มา", "การ", "ความ", "อะไร", "ยังไง", "อย่างไร", "บ้าง", "ไหม", "หรือไม่", "ครับ", "คะ", "ค่ะ",
  // English stopwords (site may get mixed-language questions)
  "the", "a", "an", "is", "are", "was", "were", "of", "in", "on", "to", "and", "or", "what", "how", "why", "does", "do", "this", "that",
]);

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
 * scale. Returns [] when nothing scores above zero, which the caller uses as
 * the "decline rather than fabricate" signal (see routers/library.ts
 * askBook) — an empty result short-circuits before ever calling the AI.
 */
export function selectRelevantPassages(fullText: string, question: string, options: SelectPassagesOptions = {}): string[] {
  const { maxPassages = 4, maxTotalChars = 6000, chunkSize = 900, overlap = 150 } = options;

  const keywords = extractKeywords(question);
  const ngrams = charNGrams(question);
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
    for (const gram of ngrams) {
      if (lower.includes(gram)) score += 1;
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
