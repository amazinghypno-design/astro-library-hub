/**
 * Remembers rendered Office previews so opening the same document twice does
 * not download it from storage and re-run the converter again.
 *
 * Converting a 0.9MB .docx costs ~3.4s of wall time on the free instance's
 * half CPU, and the result is deterministic for a given file — files are
 * immutable once uploaded (a replacement is a new row with a new id), so the
 * id is a complete cache key.
 *
 * Bounded by total bytes rather than entry count: one spreadsheet and one
 * image-heavy book differ by two orders of magnitude in size, and the budget
 * that matters on a 512MB instance is memory, not how many things are cached.
 */

interface Entry<T> {
  value: T;
  bytes: number;
}

const MAX_BYTES = 24 * 1024 * 1024;

const entries = new Map<string, Entry<unknown>>();
let totalBytes = 0;

function evictUntilFits(incoming: number): void {
  // Map preserves insertion order, and get() re-inserts on hit (below), so the
  // first key is always the least recently used.
  while (totalBytes + incoming > MAX_BYTES && entries.size > 0) {
    const oldest = entries.keys().next().value as string;
    totalBytes -= entries.get(oldest)?.bytes ?? 0;
    entries.delete(oldest);
  }
}

export function getCachedPreview<T>(key: string): T | undefined {
  const hit = entries.get(key);
  if (!hit) return undefined;
  entries.delete(key);
  entries.set(key, hit);
  return hit.value as T;
}

export function setCachedPreview<T>(key: string, value: T): void {
  const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  // A single item larger than the whole budget would evict everything and
  // still not fit — skip it rather than emptying the cache for nothing.
  if (bytes > MAX_BYTES) return;
  evictUntilFits(bytes);
  entries.set(key, { value, bytes });
  totalBytes += bytes;
}
