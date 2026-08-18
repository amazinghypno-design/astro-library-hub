/**
 * Conservative metadata inference — see PROJECT-SPECIFICATION.md section 4:
 * "ห้ามเดาข้อมูลที่ไม่มีหลักฐาน หากความมั่นใจต่ำให้เว้นว่าง". This module is
 * pure (string in, string out) so it is testable without a real PDF file;
 * the impure PDF-parsing step lives in services/pdfMetadata.ts.
 */

export interface ExtractedField {
  value: string;
  confidence: "high" | "low";
}

export interface MetadataSuggestion {
  title: ExtractedField | null;
  author: ExtractedField | null;
}

const AUTHOR_LINE_PATTERN = /^(?:โดย|เขียนโดย|ผู้แต่ง|ผู้เขียน|by)\s*[:：]?\s*(.+)$/i;
const NOISE_TITLE_PATTERN = /^(untitled|microsoft word|document\d*)\b/i;

function clean(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function isNoiseTitle(value: string): boolean {
  return value.length === 0 || NOISE_TITLE_PATTERN.test(value);
}

/**
 * Embedded PDF document-info fields (Title/Author) are the most reliable
 * source when present — they were set intentionally by whoever produced the
 * file (e.g. exported from Word) — but many scanned Thai books have them
 * empty or set to a generic default like "Microsoft Word - x.doc", so those
 * must be rejected rather than trusted at face value.
 */
export function fromEmbeddedInfo(embeddedTitle?: string, embeddedAuthor?: string): MetadataSuggestion {
  const title = clean(embeddedTitle);
  const author = clean(embeddedAuthor);

  return {
    title: title && !isNoiseTitle(title) ? { value: title, confidence: "high" } : null,
    author: author ? { value: author, confidence: "high" } : null,
  };
}

/**
 * Falls back to scanning the first page's text for an explicit author label
 * (โดย/เขียนโดย/ผู้แต่ง/ผู้เขียน) and takes the single longest non-empty line
 * as a low-confidence title candidate. Never invents an author from a bare
 * name-like line — that would be a guess without evidence.
 */
export function fromFirstPageText(firstPageText: string): MetadataSuggestion {
  const lines = firstPageText
    .split("\n")
    .map((l) => clean(l))
    .filter((l) => l.length > 0 && l.length < 120);

  let author: ExtractedField | null = null;
  for (const line of lines) {
    const match = line.match(AUTHOR_LINE_PATTERN);
    if (match && match[1]) {
      author = { value: clean(match[1]), confidence: "low" };
      break;
    }
  }

  const titleCandidate = lines
    .filter((l) => !AUTHOR_LINE_PATTERN.test(l))
    .sort((a, b) => b.length - a.length)[0];

  return {
    title: titleCandidate ? { value: titleCandidate, confidence: "low" } : null,
    author,
  };
}

/** Embedded metadata wins; low-confidence page-text guesses only fill gaps. */
export function mergeSuggestions(primary: MetadataSuggestion, fallback: MetadataSuggestion): MetadataSuggestion {
  return {
    title: primary.title ?? fallback.title,
    author: primary.author ?? fallback.author,
  };
}
