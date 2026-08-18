/**
 * Text MIME types must declare charset=utf-8 or browsers may guess the wrong
 * encoding for inline iframe/embed preview (observed: Thai text rendered as
 * mojibake when Supabase Storage served "text/plain" with no charset).
 */
export function storageContentType(mimeType: string): string {
  const normalized = mimeType.trim();
  if (normalized.startsWith("text/") && !normalized.includes("charset")) {
    return `${normalized}; charset=utf-8`;
  }
  return normalized;
}
