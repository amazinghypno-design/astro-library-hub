const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/**
 * Covers are served by GET /cover/:id with a one-year immutable cache, so the
 * URL has to carry a version or a regenerated cover would never be seen
 * again by a browser that had already loaded the old one. The file's
 * updatedAt is that version — saveCover moves it deliberately.
 */
export function coverUrl(fileId: string, version: string | Date | null | undefined): string {
  const stamp = version ? new Date(version).getTime() : 0;
  return `${API_BASE}/cover/${fileId}?v=${stamp}`;
}
