import { useCallback, useEffect, useState } from "react";

export type ViewMode = "cover" | "list";

const STORAGE_KEY = "astro-library:view-mode";

/**
 * Which of the two collection views the reader last chose — a shelf of covers,
 * or the dense list. Kept in localStorage rather than in a URL parameter or on
 * the account: it is a habit, not a place. Someone who prefers scanning a list
 * of forty titles wants that on the catalogue, the search results and an
 * author's page alike, and wants it still chosen tomorrow, whether or not they
 * ever log in.
 *
 * The `storage` listener is what keeps two open tabs from disagreeing.
 */
export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    if (typeof localStorage === "undefined") return "cover";
    return localStorage.getItem(STORAGE_KEY) === "list" ? "list" : "cover";
  });

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setMode(e.newValue === "list" ? "list" : "cover");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const choose = useCallback((next: ViewMode) => {
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing with storage denied: the choice still applies to this
      // page, it just won't outlive it.
    }
  }, []);

  return [mode, choose];
}
