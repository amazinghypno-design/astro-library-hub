import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A tray of pages captured during one sitting with a book.
 *
 * Capturing used to be one page, once: press the button and the image left
 * immediately, so sending five pages meant five round trips through the
 * capture button and the chat window, with nothing keeping count. The tray
 * holds them instead — nothing is written to disk, the count is visible, and
 * each page can be handed on whenever the reader gets to it.
 *
 * The images live in memory as blobs for exactly as long as the page is open.
 * That is the deliberate scope: this is a clipboard queue, not a folder, and
 * a reader who leaves the book has finished with them.
 */
export interface CapturedPage {
  id: string;
  /** What the reader calls this page — "หน้า 12", "แผ่นงาน Sheet1 - หน้า 2". */
  label: string;
  /** Used when the page is shared or saved rather than copied. */
  fileName: string;
  blob: Blob;
  /** Object URL for the thumbnail; revoked when the page leaves the tray. */
  url: string;
}

export interface CaptureTrayApi {
  pages: CapturedPage[];
  add: (blob: Blob, fileName: string, label: string) => CapturedPage;
  remove: (id: string) => void;
  clear: () => void;
}

export function useCaptureTray(): CaptureTrayApi {
  const [pages, setPages] = useState<CapturedPage[]>([]);

  // Cleanup on unmount needs the pages as they are *then*, not as they were
  // when the effect was created — hence the ref alongside the state.
  const pagesRef = useRef<CapturedPage[]>([]);
  pagesRef.current = pages;
  useEffect(() => {
    return () => {
      for (const p of pagesRef.current) URL.revokeObjectURL(p.url);
    };
  }, []);

  const add = useCallback((blob: Blob, fileName: string, label: string) => {
    const page: CapturedPage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label,
      fileName,
      blob,
      url: URL.createObjectURL(blob),
    };
    setPages((prev) => [...prev, page]);
    return page;
  }, []);

  const remove = useCallback((id: string) => {
    setPages((prev) => {
      const going = prev.find((p) => p.id === id);
      if (going) URL.revokeObjectURL(going.url);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    setPages((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.url);
      return [];
    });
  }, []);

  return { pages, add, remove, clear };
}
