/**
 * Reading progress and bookmarks, stored in the browser only (localStorage) —
 * this app has no public account system (see DECISIONS.md), so "this device
 * only" is the honest scope: it can't sync across devices, but needs no
 * login and works today. Keyed per fileId.
 */
const LAST_PAGE_PREFIX = "astro-library:last-page:";
const BOOKMARKS_PREFIX = "astro-library:bookmarks:";
const HIGHLIGHTS_PREFIX = "astro-library:highlights:";

export interface HighlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Highlight {
  id: string;
  pageNumber: number;
  text: string;
  rects: HighlightRect[];
}

export function getLastPage(fileId: string): number | null {
  const raw = localStorage.getItem(LAST_PAGE_PREFIX + fileId);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function saveLastPage(fileId: string, page: number): void {
  localStorage.setItem(LAST_PAGE_PREFIX + fileId, String(page));
}

export function getBookmarks(fileId: string): number[] {
  try {
    const raw = localStorage.getItem(BOOKMARKS_PREFIX + fileId);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((n) => typeof n === "number").sort((a, b) => a - b) : [];
  } catch {
    return [];
  }
}

export function toggleBookmark(fileId: string, page: number): number[] {
  const current = getBookmarks(fileId);
  const next = current.includes(page) ? current.filter((p) => p !== page) : [...current, page].sort((a, b) => a - b);
  localStorage.setItem(BOOKMARKS_PREFIX + fileId, JSON.stringify(next));
  return next;
}

export function getHighlights(fileId: string): Highlight[] {
  try {
    const raw = localStorage.getItem(HIGHLIGHTS_PREFIX + fileId);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function addHighlightLocal(fileId: string, highlight: Omit<Highlight, "id">): Highlight[] {
  const next = [...getHighlights(fileId), { ...highlight, id: crypto.randomUUID() }];
  localStorage.setItem(HIGHLIGHTS_PREFIX + fileId, JSON.stringify(next));
  return next;
}

export function removeHighlightLocal(fileId: string, id: string): Highlight[] {
  const next = getHighlights(fileId).filter((h) => h.id !== id);
  localStorage.setItem(HIGHLIGHTS_PREFIX + fileId, JSON.stringify(next));
  return next;
}
