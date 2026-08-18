/**
 * Content-Disposition attachment filename must round-trip the original Thai
 * name via RFC 5987 (filename*=UTF-8''...) while keeping a plain-ASCII
 * fallback filename for clients that ignore filename*.
 */
export function buildContentDisposition(originalName: string): string {
  const asciiFallback = originalName.replace(/[^\x20-\x7E]/g, "_") || "download";
  const encoded = encodeURIComponent(originalName);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
