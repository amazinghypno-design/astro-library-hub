import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { IconBookmark, IconChevronLeft, IconChevronRight, IconHighlighter, IconTrash } from "./icons";
import {
  addHighlightLocal,
  getBookmarks,
  getHighlights,
  getLastPage,
  removeHighlightLocal,
  saveLastPage,
  toggleBookmark,
  type Highlight,
} from "../lib/readingProgress";
import { trpc } from "../lib/trpc";

/** A selection the reader just made, waiting for the "ไฮไลต์" button to be pressed. */
interface PendingSelection {
  pageNumber: number;
  text: string;
  rects: Highlight["rects"];
  buttonX: number;
  buttonY: number;
}

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// How far outside the viewport (in px) a page starts rendering before it's
// scrolled into view — this is what makes "next page" feel instant: by the
// time you scroll or tap next, the page is usually already rendered.
const PRELOAD_MARGIN_PX = 1000;
const DEFAULT_ASPECT = 842 / 595; // A4 guess, corrected once the real first page loads

/**
 * A real PDF.js-based reader instead of relying on the browser's own
 * <embed>/<iframe> PDF viewer — that was unreliable in practice (verified:
 * a real 145-page scanned PDF rendered as a plain black box in a real
 * desktop Chrome, with no visible error). Every page is a continuous,
 * natively scrollable list (touch-drag or the browser's own right-edge
 * scrollbar moves through the whole document) rather than one page at a
 * time — each page virtualizes its own canvas in/out via IntersectionObserver
 * so a 300+ page book doesn't render everything at once.
 */
export default function PdfReader({
  url,
  downloadUrl,
  fileId,
  pageOffset = 0,
}: {
  url: string;
  downloadUrl?: string;
  /** Enables continue-reading + bookmarks, keyed by this id. Omit to disable both. */
  fileId?: string;
  /** "PDF page = table-of-contents page + pageOffset" — see admin's "เลขหน้าอ้างอิง (สารบัญ)" field. */
  pageOffset?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const initializedProgressRef = useRef(false);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageWidth, setPageWidth] = useState(760);
  const [defaultAspect, setDefaultAspect] = useState(DEFAULT_ASPECT);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorDetail, setErrorDetail] = useState<string>("");
  const [jumpInput, setJumpInput] = useState("");
  const [resumeBanner, setResumeBanner] = useState<number | null>(null);
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [highlightsOpen, setHighlightsOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);

  // Logged in (today: only the site owner, via /admin/login) → progress and
  // bookmarks sync through the account across every device they log into.
  // Logged out → same features still work, but stay local to this browser
  // (localStorage) since there's no way to know it's "the same person" otherwise.
  const me = trpc.auth.me.useQuery();
  const isLoggedIn = !!me.data;
  const progressQuery = trpc.progress.get.useQuery({ fileId: fileId ?? "" }, { enabled: isLoggedIn && !!fileId });
  const saveLastPageMutation = trpc.progress.saveLastPage.useMutation();
  const toggleBookmarkMutation = trpc.progress.toggleBookmark.useMutation();
  const addHighlightMutation = trpc.progress.addHighlight.useMutation();
  const removeHighlightMutation = trpc.progress.removeHighlight.useMutation();

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    initializedProgressRef.current = false;
    pdfjsLib
      .getDocument(url)
      .promise.then(async (doc) => {
        if (cancelled) return;
        docRef.current = doc;
        setNumPages(doc.numPages);
        try {
          const firstPage = await doc.getPage(1);
          const vp = firstPage.getViewport({ scale: 1 });
          if (!cancelled) setDefaultAspect(vp.height / vp.width);
        } catch {
          // keep the A4 guess
        }
        if (!cancelled) {
          setCurrentPage(1);
          setStatus("ready");
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorDetail(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });
    return () => {
      cancelled = true;
      docRef.current?.destroy();
    };
  }, [url]);

  // One-time init of resume banner + bookmarks, from the account if logged
  // in (waits for progressQuery), otherwise from this browser's localStorage.
  useEffect(() => {
    if (status !== "ready" || !fileId || initializedProgressRef.current || me.isLoading) return;
    if (isLoggedIn) {
      if (!progressQuery.data) return;
      if (progressQuery.data.lastPage && progressQuery.data.lastPage > 1) setResumeBanner(progressQuery.data.lastPage);
      setBookmarks(progressQuery.data.bookmarks);
      setHighlights(progressQuery.data.highlights);
    } else {
      const saved = getLastPage(fileId);
      if (saved && saved > 1) setResumeBanner(saved);
      setBookmarks(getBookmarks(fileId));
      setHighlights(getHighlights(fileId));
    }
    initializedProgressRef.current = true;
  }, [status, fileId, isLoggedIn, me.isLoading, progressQuery.data]);

  // Auto-saves reading position — synced to the account when logged in,
  // otherwise the same device-local pattern Kindle/Google Play Books use.
  useEffect(() => {
    if (!fileId || status !== "ready" || !initializedProgressRef.current) return;
    if (isLoggedIn) {
      saveLastPageMutation.mutate({ fileId, page: currentPage });
    } else {
      saveLastPage(fileId, currentPage);
    }
  }, [fileId, status, currentPage, isLoggedIn]);

  useEffect(() => {
    if (status !== "ready" || !scrollRef.current) return;
    const el = scrollRef.current;
    const update = () => setPageWidth(Math.min(el.clientWidth - 32, 760));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [status]);

  const handlePageInView = useCallback((n: number) => setCurrentPage(n), []);

  function goToPage(n: number) {
    if (!numPages) return;
    const target = Math.min(Math.max(1, n), numPages);
    document.getElementById(`pdf-page-${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onJumpSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(jumpInput);
    if (!Number.isFinite(n) || n < 1) return;
    goToPage(n + pageOffset);
    setJumpInput("");
  }

  function onToggleBookmark() {
    if (!fileId) return;
    if (isLoggedIn) {
      toggleBookmarkMutation.mutate({ fileId, page: currentPage }, { onSuccess: (result) => setBookmarks(result) });
    } else {
      setBookmarks(toggleBookmark(fileId, currentPage));
    }
  }

  function saveHighlight(pageNumber: number, text: string, rects: Highlight["rects"]) {
    if (!fileId) return;
    if (isLoggedIn) {
      addHighlightMutation.mutate(
        { fileId, page: pageNumber, text, rects },
        { onSuccess: (created) => setHighlights((prev) => [...prev, created]) },
      );
    } else {
      setHighlights(addHighlightLocal(fileId, { pageNumber, text, rects }));
    }
  }

  function deleteHighlight(id: string) {
    if (!fileId) return;
    if (isLoggedIn) {
      removeHighlightMutation.mutate({ id }, { onSuccess: () => setHighlights((prev) => prev.filter((h) => h.id !== id)) });
    } else {
      setHighlights(removeHighlightLocal(fileId, id));
    }
  }

  // Watches the browser's own text selection (works for mouse drag and
  // touch long-press-select alike) and offers a "ไฮไลต์" button once a
  // selection lands entirely inside one page's text layer.
  useEffect(() => {
    if (!fileId) return;
    function onSelectionChange() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setPendingSelection(null);
        return;
      }
      const text = selection.toString().trim();
      if (!text) {
        setPendingSelection(null);
        return;
      }
      const anchorEl = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement;
      const pageEl = anchorEl?.closest<HTMLElement>("[data-pdf-page]");
      if (!pageEl) {
        setPendingSelection(null);
        return;
      }
      const pageNumber = Number(pageEl.dataset.pdfPage);
      const pageRect = pageEl.getBoundingClientRect();
      const range = selection.getRangeAt(0);
      const clientRects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
      if (clientRects.length === 0 || pageRect.width === 0 || pageRect.height === 0) {
        setPendingSelection(null);
        return;
      }
      const rects: Highlight["rects"] = clientRects.map((r) => ({
        x: (r.left - pageRect.left) / pageRect.width,
        y: (r.top - pageRect.top) / pageRect.height,
        w: r.width / pageRect.width,
        h: r.height / pageRect.height,
      }));
      const lastRect = clientRects[clientRects.length - 1];
      setPendingSelection({
        pageNumber,
        text,
        rects,
        buttonX: Math.min(lastRect.right, window.innerWidth - 140),
        buttonY: lastRect.bottom + 8,
      });
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [fileId]);

  // A stale-positioned popup floating over the wrong spot after scrolling is
  // worse than no popup — drop it and let a fresh selection bring it back.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onScroll() {
      setPendingSelection(null);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [status]);

  function confirmHighlight() {
    if (!pendingSelection) return;
    saveHighlight(pendingSelection.pageNumber, pendingSelection.text, pendingSelection.rects);
    window.getSelection()?.removeAllRanges();
    setPendingSelection(null);
  }

  const isCurrentPageBookmarked = bookmarks.includes(currentPage);

  if (status === "error") {
    return (
      <div className="rounded-2xl overflow-hidden border border-navy-900/[0.07] shadow-card">
        <div className="flex flex-col items-center justify-center h-[400px] gap-3 text-center px-6 bg-white">
          <div className="text-red-700">ไม่สามารถแสดงตัวอย่าง PDF ได้ ({errorDetail || "unknown error"})</div>
          {downloadUrl && (
            <a href={downloadUrl} className="text-gold-700 hover:underline text-sm font-medium">
              ดาวน์โหลดไฟล์แทน
            </a>
          )}
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="rounded-2xl overflow-hidden border border-navy-900/[0.07] shadow-card">
        <div className="flex flex-col items-center justify-center h-[400px] gap-3 bg-navy-950 text-ivory/70">
          <span className="inline-flex gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-pulse [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-pulse [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-pulse" />
          </span>
          <span className="text-sm tracking-wide">กำลังโหลด PDF...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-navy-900/[0.07] shadow-card">
      {resumeBanner != null && (
        <div className="flex items-center justify-between gap-3 px-5 py-3 bg-gradient-to-r from-gold-400/15 to-gold-400/5 border-b border-gold-500/20 text-sm">
          <span className="text-navy-800 inline-flex items-center gap-2">
            <IconBookmark width={15} height={15} className="text-gold-600 shrink-0" fill="currentColor" />
            อ่านค้างไว้ที่หน้า {Math.max(1, resumeBanner - pageOffset)}
          </span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                goToPage(resumeBanner);
                setResumeBanner(null);
              }}
              className="text-gold-700 hover:text-gold-800 hover:underline font-semibold"
            >
              ไปต่อ
            </button>
            <button
              type="button"
              onClick={() => setResumeBanner(null)}
              aria-label="ปิด"
              className="text-navy-700/40 hover:text-navy-700 leading-none"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      <div ref={scrollRef} className="overflow-y-auto max-h-[70vh] p-4 sm:p-6 bg-navy-900/[0.03]">
        {docRef.current &&
          numPages &&
          Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
            <PageSlot
              key={n}
              doc={docRef.current!}
              pageNumber={n}
              pageWidth={pageWidth}
              defaultAspect={defaultAspect}
              onInView={handlePageInView}
              highlights={highlights.filter((h) => h.pageNumber === n)}
            />
          ))}
      </div>

      {pendingSelection && (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            confirmHighlight();
          }}
          style={{ position: "fixed", left: pendingSelection.buttonX, top: pendingSelection.buttonY, zIndex: 30 }}
          className="inline-flex items-center gap-1.5 bg-navy-950 text-gold-400 text-sm font-medium px-3 py-1.5 rounded-lg shadow-card-hover"
        >
          <IconHighlighter width={14} height={14} /> ไฮไลต์
        </button>
      )}

      {/* Placed below the scroll area (not above) so it stays within thumb reach on mobile. */}
      <div className="flex items-center justify-center gap-5 sm:gap-8 py-3 bg-navy-950 text-ivory">
        <button
          type="button"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="หน้าก่อนหน้า"
          className="p-2 rounded-full transition-colors hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent"
        >
          <IconChevronLeft width={18} height={18} />
        </button>
        <span className="font-serif tabular-nums text-base tracking-wide">
          หน้า <span className="text-gold-400 font-semibold">{currentPage}</span>
          <span className="text-ivory/35 mx-1.5">/</span>
          {numPages}
        </span>
        <button
          type="button"
          onClick={() => goToPage(currentPage + 1)}
          disabled={!numPages || currentPage >= numPages}
          aria-label="หน้าถัดไป"
          className="p-2 rounded-full transition-colors hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent"
        >
          <IconChevronRight width={18} height={18} />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 py-2.5 px-3 bg-white border-t border-navy-900/[0.06] text-sm">
        <form onSubmit={onJumpSubmit} className="flex items-center gap-1.5">
          <label htmlFor="pdf-jump-input" className="text-navy-700/55 text-xs sm:text-sm">
            ไปหน้า (สารบัญ)
          </label>
          <input
            id="pdf-jump-input"
            type="number"
            min={1}
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            className="w-16 px-2 py-1 rounded-lg border border-navy-900/15 tabular-nums focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-500"
          />
          <button
            type="submit"
            className="px-3 py-1 rounded-lg border border-navy-900/15 font-medium text-navy-800 hover:border-gold-500 hover:bg-gold-400/5 transition-colors"
          >
            ไป
          </button>
        </form>

        {fileId && (
          <>
            <span className="w-px h-5 bg-navy-900/10 hidden sm:block" aria-hidden />
            <button
              type="button"
              onClick={onToggleBookmark}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border transition-colors ${
                isCurrentPageBookmarked
                  ? "border-gold-500/50 text-gold-700 bg-gold-400/10"
                  : "border-navy-900/15 text-navy-700 hover:border-gold-500 hover:bg-gold-400/5"
              }`}
            >
              <IconBookmark width={15} height={15} fill={isCurrentPageBookmarked ? "currentColor" : "none"} />
              {isCurrentPageBookmarked ? "คั่นหน้านี้แล้ว" : "คั่นหน้านี้"}
            </button>
            {bookmarks.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setBookmarksOpen((v) => !v)}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg border border-navy-900/15 text-navy-700 hover:border-gold-500 hover:bg-gold-400/5 transition-colors"
                >
                  รายการที่คั่น
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-gold-400/20 text-gold-700 text-xs font-semibold">
                    {bookmarks.length}
                  </span>
                  <span className="text-navy-700/40 text-[10px]">{bookmarksOpen ? "▲" : "▼"}</span>
                </button>
                {bookmarksOpen && (
                  <div className="absolute bottom-full mb-2 right-0 bg-white border border-navy-900/10 rounded-xl shadow-card-hover py-1.5 min-w-[150px] z-10">
                    {bookmarks.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          goToPage(p);
                          setBookmarksOpen(false);
                        }}
                        className="w-full text-left px-3.5 py-1.5 hover:bg-gold-400/5 text-navy-800 inline-flex items-center gap-2"
                      >
                        <IconBookmark width={12} height={12} className="text-gold-500 shrink-0" fill="currentColor" />
                        หน้า {Math.max(1, p - pageOffset)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {highlights.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setHighlightsOpen((v) => !v)}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg border border-navy-900/15 text-navy-700 hover:border-gold-500 hover:bg-gold-400/5 transition-colors"
                >
                  <IconHighlighter width={14} height={14} />
                  ไฮไลต์
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-gold-400/20 text-gold-700 text-xs font-semibold">
                    {highlights.length}
                  </span>
                  <span className="text-navy-700/40 text-[10px]">{highlightsOpen ? "▲" : "▼"}</span>
                </button>
                {highlightsOpen && (
                  <div className="absolute bottom-full mb-2 right-0 bg-white border border-navy-900/10 rounded-xl shadow-card-hover py-1.5 w-64 max-h-72 overflow-y-auto z-10">
                    {[...highlights]
                      .sort((a, b) => a.pageNumber - b.pageNumber)
                      .map((h) => (
                        <div key={h.id} className="group flex items-start gap-1 hover:bg-gold-400/5">
                          <button
                            type="button"
                            onClick={() => {
                              goToPage(h.pageNumber);
                              setHighlightsOpen(false);
                            }}
                            className="flex-1 min-w-0 text-left pl-3.5 pr-1.5 py-2 text-navy-800"
                          >
                            <span className="text-xs text-gold-700 font-medium">หน้า {Math.max(1, h.pageNumber - pageOffset)}</span>
                            <span className="block text-sm text-navy-700/80 line-clamp-2 mt-0.5">{h.text}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteHighlight(h.id)}
                            aria-label="ลบไฮไลต์นี้"
                            className="shrink-0 mt-2 mr-2 p-1 rounded text-navy-700/30 hover:text-red-700 hover:bg-red-50 transition-colors"
                          >
                            <IconTrash width={13} height={13} />
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PageSlot({
  doc,
  pageNumber,
  pageWidth,
  defaultAspect,
  onInView,
  highlights,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  pageWidth: number;
  defaultAspect: number;
  onInView: (pageNumber: number) => void;
  highlights: Highlight[];
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const [aspect, setAspect] = useState(defaultAspect);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRendered(true);
          if (entry.intersectionRatio > 0.5) onInView(pageNumber);
        } else {
          // Scrolled well outside the preload margin — free this page's canvas
          // memory; it re-renders from pdf.js's own cached document if revisited.
          setRendered(false);
        }
      },
      { rootMargin: `${PRELOAD_MARGIN_PX}px 0px`, threshold: [0, 0.5] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNumber, onInView]);

  useEffect(() => {
    if (!rendered || !canvasRef.current) return;
    let cancelled = false;
    doc.getPage(pageNumber).then(async (page) => {
      if (cancelled || !canvasRef.current) return;
      const unscaledViewport = page.getViewport({ scale: 1 });
      setAspect(unscaledViewport.height / unscaledViewport.width);
      // The scale that makes the page's CSS box match pageWidth exactly —
      // shared by the text layer/highlights below, which must line up with
      // whatever size the canvas is actually displayed at (its CSS box),
      // not with its internal pixel buffer (which the dpr cap below inflates).
      const cssScale = pageWidth / unscaledViewport.width;
      // devicePixelRatio-aware so the canvas isn't blurrily upscaled on Retina/HiDPI screens.
      const displayScale = Math.min(cssScale, 2);
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: displayScale * dpr });

      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, canvasContext: context, viewport }).promise.catch(() => {});
      if (cancelled || !textLayerRef.current) return;

      textLayerRef.current.replaceChildren();
      const textContent = await page.getTextContent();
      if (cancelled || !textLayerRef.current) return;
      const cssViewport = page.getViewport({ scale: cssScale });
      await new pdfjsLib.TextLayer({ textContentSource: textContent, container: textLayerRef.current, viewport: cssViewport })
        .render()
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [rendered, doc, pageNumber, pageWidth]);

  return (
    <div
      ref={wrapperRef}
      id={`pdf-page-${pageNumber}`}
      data-pdf-page={pageNumber}
      className="relative mx-auto mb-4 bg-white shadow-[0_1px_2px_rgba(15,23,48,0.06),0_10px_22px_-10px_rgba(15,23,48,0.18)] rounded-sm"
      style={{ width: pageWidth, aspectRatio: `${1 / aspect}` }}
    >
      {rendered ? (
        <>
          <canvas ref={canvasRef} className="w-full h-full block" />
          {/* Purely decorative — sits under the (invisible, selectable) text layer, so it
              can't be a click target itself. Deleting a highlight happens from the list below. */}
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
            {highlights.map((h) =>
              h.rects.map((r, i) => (
                <div
                  key={`${h.id}-${i}`}
                  className="absolute bg-gold-400/40 rounded-[2px]"
                  style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
                />
              )),
            )}
          </div>
          <div ref={textLayerRef} className="textLayer" style={{ zIndex: 2 }} />
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-navy-700/25 text-sm font-serif">หน้า {pageNumber}</div>
      )}
    </div>
  );
}
