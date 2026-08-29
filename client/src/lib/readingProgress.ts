/**
 * Reading progress and bookmarks, stored in the browser only (localStorage) —
 * this app has no public account system (see DECISIONS.md), so "this device
 * only" is the honest scope: it can't sync across devices, but needs no
 * login and works today. Keyed per fileId.
 */
const LAST_PAGE_PREFIX = "astro-library:last-page:";
const BOOKMARKS_PREFIX = "astro-library:bookmarks:";
const HIGHLIGHTS_PREFIX = "astro-library:highlights:";
const DRAWINGS_PREFIX = "astro-library:drawings:";

export interface HighlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A marked page plus what the reader said it was about. `note` is "" when they
 * haven't written one — the same shape the server stores (see progress
 * router), so both paths hand the reader components identical objects.
 */
export interface Bookmark {
  pageNumber: number;
  note: string;
}

export interface Highlight {
  id: string;
  pageNumber: number;
  text: string;
  rects: HighlightRect[];
}

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface Drawing {
  id: string;
  pageNumber: number;
  tool: "pen" | "highlighter";
  color: string;
  strokeWidth: number;
  points: DrawingPoint[];
}

/**
 * What the drawing toolbar offers. Ruler and eraser are ways of *making* marks
 * rather than new kinds of mark, so neither adds a value to the saved
 * `Drawing["tool"]` (or to its `drawing_tool` enum in the database): a ruler
 * stroke is an ordinary pen stroke that was held straight while it was drawn,
 * and the eraser saves nothing at all — it deletes strokes it is dragged over.
 */
export type DrawToolId = Drawing["tool"] | "ruler" | "eraser";

/** The kind of mark a tool leaves behind — what is actually stored. */
export function markLeftBy(tool: DrawToolId): Drawing["tool"] {
  return tool === "highlighter" ? "highlighter" : "pen";
}

export function getLastPage(fileId: string): number | null {
  const raw = localStorage.getItem(LAST_PAGE_PREFIX + fileId);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function saveLastPage(fileId: string, page: number): void {
  localStorage.setItem(LAST_PAGE_PREFIX + fileId, String(page));
}

export function getBookmarks(fileId: string): Bookmark[] {
  try {
    const raw = localStorage.getItem(BOOKMARKS_PREFIX + fileId);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    // Bookmarks saved before notes existed are bare page numbers. They are
    // read as notes-less bookmarks rather than discarded, and rewritten in the
    // new shape the next time this file's bookmarks are saved.
    return sortBookmarks(
      arr.flatMap((entry): Bookmark[] => {
        if (typeof entry === "number") return [{ pageNumber: entry, note: "" }];
        if (entry && typeof entry.pageNumber === "number") {
          return [{ pageNumber: entry.pageNumber, note: typeof entry.note === "string" ? entry.note : "" }];
        }
        return [];
      }),
    );
  } catch {
    return [];
  }
}

function sortBookmarks(list: Bookmark[]): Bookmark[] {
  return [...list].sort((a, b) => a.pageNumber - b.pageNumber);
}

function saveBookmarks(fileId: string, list: Bookmark[]): Bookmark[] {
  const next = sortBookmarks(list);
  localStorage.setItem(BOOKMARKS_PREFIX + fileId, JSON.stringify(next));
  return next;
}

export function toggleBookmark(fileId: string, page: number): Bookmark[] {
  const current = getBookmarks(fileId);
  const marked = current.some((b) => b.pageNumber === page);
  return saveBookmarks(fileId, marked ? current.filter((b) => b.pageNumber !== page) : [...current, { pageNumber: page, note: "" }]);
}

/** Mirrors the server's setBookmarkNote: writing a note marks the page too. */
export function setBookmarkNoteLocal(fileId: string, page: number, note: string): Bookmark[] {
  const trimmed = note.trim();
  const current = getBookmarks(fileId);
  const exists = current.some((b) => b.pageNumber === page);
  return saveBookmarks(
    fileId,
    exists
      ? current.map((b) => (b.pageNumber === page ? { ...b, note: trimmed } : b))
      : [...current, { pageNumber: page, note: trimmed }],
  );
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

export function getDrawings(fileId: string): Drawing[] {
  try {
    const raw = localStorage.getItem(DRAWINGS_PREFIX + fileId);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function addDrawingLocal(fileId: string, drawing: Omit<Drawing, "id">): Drawing[] {
  const next = [...getDrawings(fileId), { ...drawing, id: crypto.randomUUID() }];
  localStorage.setItem(DRAWINGS_PREFIX + fileId, JSON.stringify(next));
  return next;
}

export function removeDrawingLocal(fileId: string, id: string): Drawing[] {
  const next = getDrawings(fileId).filter((d) => d.id !== id);
  localStorage.setItem(DRAWINGS_PREFIX + fileId, JSON.stringify(next));
  return next;
}

export function clearPageDrawingsLocal(fileId: string, page: number): Drawing[] {
  const next = getDrawings(fileId).filter((d) => d.pageNumber !== page);
  localStorage.setItem(DRAWINGS_PREFIX + fileId, JSON.stringify(next));
  return next;
}
