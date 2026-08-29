import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  IconBookmark,
  IconCamera,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconCollapse,
  IconExpand,
  IconHighlighter,
  IconPen,
  IconTrash,
  IconUndo,
} from "./icons";
import { toThaiPdfErrorMessage } from "../lib/errorMessages";
import { safeFileName, shareOrSaveImage } from "../lib/shareOrSaveImage";
import { useReaderFullscreen, type ReaderHandle } from "../lib/useReaderFullscreen";
import { useIsTouchDevice, useOrientation } from "../lib/useViewport";
import RotateDeviceOverlay from "./RotateDeviceOverlay";
import LandscapeDocumentHint from "./LandscapeDocumentHint";
import BookmarkMenu from "./BookmarkMenu";
import {
  addDrawingLocal,
  addHighlightLocal,
  clearPageDrawingsLocal,
  getBookmarks,
  getDrawings,
  getHighlights,
  getLastPage,
  removeDrawingLocal,
  markLeftBy,
  removeHighlightLocal,
  saveLastPage,
  setBookmarkNoteLocal,
  toggleBookmark,
  type Bookmark,
  type Drawing,
  type DrawingPoint,
  type DrawToolId,
  type Highlight,
} from "../lib/readingProgress";
import { DRAW_TOOLS, PEN_COLORS, paletteFor, strokeWidthFor } from "../lib/drawTools";
import { strokesUnderEraser } from "../lib/strokeGeometry";
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
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
// A portrait book page reads well as a narrow column; a landscape page
// (slides, wide posters) squashed into that same narrow column comes out
// short and cramped, so it gets a wider stage to fill instead.
const MAX_WIDTH_PORTRAIT = 760;
const MAX_WIDTH_LANDSCAPE = 1100;

const ZOOM_STEP = 0.25;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

interface PdfReaderProps {
  url: string;
  downloadUrl?: string;
  /** Enables continue-reading + bookmarks, keyed by this id. Omit to disable both. */
  fileId?: string;
  /** "PDF page = table-of-contents page + pageOffset" — see admin's "เลขหน้าอ้างอิง (สารบัญ)" field. */
  pageOffset?: number;
  /** Used to name/caption a captured page image. Omit to fall back to a generic name. */
  title?: string;
}

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
const PdfReader = forwardRef<ReaderHandle, PdfReaderProps>(function PdfReader(
  { url, downloadUrl, fileId, pageOffset = 0, title },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const initializedProgressRef = useRef(false);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const currentPageRef = useRef(1);
  const [fitWidth, setFitWidth] = useState(760);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [pinchScale, setPinchScale] = useState(1);
  const zoomLevelRef = useRef(1);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(1);
  const pinchScaleRef = useRef(1);
  const [defaultAspect, setDefaultAspect] = useState(DEFAULT_ASPECT);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorDetail, setErrorDetail] = useState<string>("");
  const [jumpInput, setJumpInput] = useState("");
  const [resumeBanner, setResumeBanner] = useState<number | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  // Which bookmark's description is being written — set the moment a page is
  // marked, so the reader is asked what it is about while they still remember.
  const [editingBookmarkPage, setEditingBookmarkPage] = useState<number | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [highlightsOpen, setHighlightsOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const drawingsRef = useRef<Drawing[]>([]);
  const [drawTool, setDrawTool] = useState<DrawToolId>("pen");
  const [drawColor, setDrawColor] = useState(PEN_COLORS[0]);
  const [drawMode, setDrawMode] = useState(false);
  const [drawToolbarOpen, setDrawToolbarOpen] = useState(false);
  const [capturingPage, setCapturingPage] = useState(false);
  // Fullscreen only: lets the reader put every bar away and have the whole
  // screen be the page, with one tap to bring the tools back.
  const [toolbarsHidden, setToolbarsHidden] = useState(false);

  // Logged in (today: only the site owner, via /admin/login) → progress and
  // bookmarks sync through the account across every device they log into.
  // Logged out → same features still work, but stay local to this browser
  // (localStorage) since there's no way to know it's "the same person" otherwise.
  const me = trpc.auth.me.useQuery();
  const isLoggedIn = !!me.data;
  const progressQuery = trpc.progress.get.useQuery({ fileId: fileId ?? "" }, { enabled: isLoggedIn && !!fileId });
  const saveLastPageMutation = trpc.progress.saveLastPage.useMutation();
  const toggleBookmarkMutation = trpc.progress.toggleBookmark.useMutation();
  const setBookmarkNoteMutation = trpc.progress.setBookmarkNote.useMutation();
  const addHighlightMutation = trpc.progress.addHighlight.useMutation();
  const removeHighlightMutation = trpc.progress.removeHighlight.useMutation();
  const addDrawingMutation = trpc.progress.addDrawing.useMutation();
  const removeDrawingMutation = trpc.progress.removeDrawing.useMutation();
  const clearPageDrawingsMutation = trpc.progress.clearPageDrawings.useMutation();

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    initializedProgressRef.current = false;
    setZoomLevel(1);
    pdfjsLib
      // R2 serves byte ranges, so pdf.js can fetch the pages it is actually
      // showing instead of the whole book before the first page appears — a
      // 6 MB scan opens on its first page rather than after 6 MB. Without
      // disableAutoFetch pdf.js would still pull the rest in the background
      // and hold the connection while a reader sits on page 1.
      .getDocument({ url, disableAutoFetch: true, rangeChunkSize: 262144 })
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
        setErrorDetail(toThaiPdfErrorMessage(err));
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
      setDrawings(progressQuery.data.drawings);
    } else {
      const saved = getLastPage(fileId);
      if (saved && saved > 1) setResumeBanner(saved);
      setBookmarks(getBookmarks(fileId));
      setHighlights(getHighlights(fileId));
      setDrawings(getDrawings(fileId));
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

  // A page wider than it is tall — slides, wide scans — is the case that reads
  // badly on a phone held upright, and the one worth asking to rotate for.
  const isLandscapeDocument = defaultAspect < 1;
  const {
    isFullscreen,
    toggle: toggleFullscreen,
    enter: enterFullscreen,
    exit: exitFullscreen,
  } = useReaderFullscreen(containerRef, {
    preferLandscape: isLandscapeDocument,
  });
  const orientation = useOrientation();
  const isTouchDevice = useIsTouchDevice();
  const [rotateHintDismissed, setRotateHintDismissed] = useState(false);
  const showRotateHint =
    isFullscreen && isTouchDevice && isLandscapeDocument && orientation === "portrait" && !rotateHintDismissed;
  const showLandscapeHint = !isFullscreen && isTouchDevice && isLandscapeDocument;

  // Offer the hint again next time: a reader who dismissed it once while
  // standing on a train may well want it on the next document.
  useEffect(() => {
    if (!isFullscreen) {
      setRotateHintDismissed(false);
      // Hiding the bars is a fullscreen affordance; the reader needs its
      // toolbar back the moment it is a panel on the page again.
      setToolbarsHidden(false);
    }
  }, [isFullscreen]);

  // The page's own "อ่านเต็มจอ" button enters THIS fullscreen, so the reader
  // keeps its pen, highlighter and capture toolbar. Pressed before the PDF has
  // finished loading, it is remembered and applied on the first ready render —
  // the native fullscreen call will have lost its user gesture by then, but the
  // hook's CSS layer fills the screen either way.
  const pendingFullscreenRef = useRef(false);
  useImperativeHandle(
    ref,
    () => ({
      enterFullscreen: () => {
        if (status === "ready") enterFullscreen();
        else pendingFullscreenRef.current = true;
      },
    }),
    [status, enterFullscreen],
  );
  useEffect(() => {
    if (status !== "ready" || !pendingFullscreenRef.current) return;
    pendingFullscreenRef.current = false;
    enterFullscreen();
  }, [status, enterFullscreen]);

  useEffect(() => {
    if (status !== "ready" || !scrollRef.current) return;
    const el = scrollRef.current;
    // defaultAspect starts as an A4 guess and is corrected to the real
    // page-1 aspect once the PDF loads — landscape files (height < width,
    // aspect < 1) get the wider stage from that point on.
    const maxWidth = defaultAspect < 1 ? MAX_WIDTH_LANDSCAPE : MAX_WIDTH_PORTRAIT;
    const update = () => {
      const availableWidth = el.clientWidth - 32;
      if (!isFullscreen) {
        setFitWidth(Math.min(availableWidth, maxWidth));
        return;
      }
      // Fullscreen fills the screen, so the desktop max widths do not apply.
      //
      // Whether height also constrains depends on the page's shape. A landscape
      // page is the case fullscreen exists for: fit it whole, so nothing hangs
      // off the bottom. A portrait page fitted whole on a phone held sideways
      // would shrink to a third of the screen's width and be unreadable — for
      // those, filling the width and scrolling down is how reading actually
      // works, and is what every reader app does.
      const availableHeight = el.clientHeight - 32;
      const widthThatFitsHeight = availableHeight / defaultAspect;
      setFitWidth(
        isLandscapeDocument ? Math.max(120, Math.min(availableWidth, widthThatFitsHeight)) : availableWidth,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
    // See the note in OfficePreview: rotation is a first-class trigger here,
    // not just whatever resize event the browser happens to emit.
  }, [status, defaultAspect, isFullscreen, isLandscapeDocument, orientation]);

  const pageWidth = Math.round(fitWidth * zoomLevel);


  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  // Zooming changes every page's height, which shifts what the old raw
  // scroll offset lands on (e.g. zooming in makes earlier pages taller,
  // pushing the viewport back to an earlier page than the reader was
  // actually on) — so re-jump to the same page, without the "smooth"
  // animation (this is a correction, not a navigation the reader asked for).
  function recenterOnPage(page: number) {
    // A single rAF fires before the next paint, but reflowing 100+ page
    // wrappers to a new height/width doesn't necessarily finish within that
    // one frame — jumping too early lands on a half-settled layout and the
    // scroll-position math ends up on the wrong page. A short delay instead
    // of a frame callback reliably waits until layout has actually settled.
    setTimeout(() => {
      document.getElementById(`pdf-page-${page}`)?.scrollIntoView({ behavior: "auto", block: "start" });
    }, 60);
  }

  function zoomIn() {
    setZoomLevel((z) => clampZoom(z + ZOOM_STEP));
    recenterOnPage(currentPageRef.current);
  }
  function zoomOut() {
    setZoomLevel((z) => clampZoom(z - ZOOM_STEP));
    recenterOnPage(currentPageRef.current);
  }
  function resetZoom() {
    setZoomLevel(1);
    recenterOnPage(currentPageRef.current);
  }

  // Two-finger pinch — live-scales the page list visually via a CSS
  // transform (cheap) while the gesture is active, then "commits" the
  // gesture into zoomLevel on release, which triggers a real, crisp re-render
  // at the new resolution. Re-rendering the PDF canvas on every touchmove
  // instead would be far too slow to track a finger smoothly.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function distance(touches: TouchList) {
      return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    }
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        pinchStartDistRef.current = distance(e.touches);
        pinchStartZoomRef.current = zoomLevelRef.current;
      }
    }
    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && pinchStartDistRef.current) {
        e.preventDefault();
        const ratio = distance(e.touches) / pinchStartDistRef.current;
        pinchScaleRef.current = ratio;
        setPinchScale(ratio);
      }
    }
    function onTouchEnd() {
      if (pinchStartDistRef.current) {
        setZoomLevel(clampZoom(pinchStartZoomRef.current * pinchScaleRef.current));
        pinchStartDistRef.current = null;
        pinchScaleRef.current = 1;
        setPinchScale(1);
        recenterOnPage(currentPageRef.current);
      }
    }
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [status]);

  // Ctrl/Cmd + mouse wheel, and trackpad pinch — a trackpad pinch is exactly
  // what a browser reports here too: it synthesizes a wheel event with
  // ctrlKey set, so one handler covers both without telling them apart.
  // preventDefault stops that from zooming the whole browser page instead.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let recenterTimeout: number | undefined;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.002);
      setZoomLevel((z) => clampZoom(z * factor));
      // Wheel/pinch fires many events per gesture — only recenter once it settles,
      // not on every tick (that would fight the still-moving scroll position).
      window.clearTimeout(recenterTimeout);
      recenterTimeout = window.setTimeout(() => recenterOnPage(currentPageRef.current), 150);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.clearTimeout(recenterTimeout);
    };
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
    const page = currentPage;
    const wasMarked = bookmarks.some((b) => b.pageNumber === page);
    if (isLoggedIn) {
      toggleBookmarkMutation.mutate({ fileId, page }, { onSuccess: (result) => setBookmarks(result) });
    } else {
      setBookmarks(toggleBookmark(fileId, page));
    }
    // Marking a page and saying what it is about are one gesture: the list
    // opens on the new bookmark with its note field ready. Un-marking closes
    // whatever was open instead.
    if (wasMarked) {
      setEditingBookmarkPage((p) => (p === page ? null : p));
    } else {
      setBookmarksOpen(true);
      setEditingBookmarkPage(page);
    }
  }

  function saveBookmarkNote(page: number, note: string) {
    if (!fileId) return;
    if (isLoggedIn) {
      setBookmarkNoteMutation.mutate({ fileId, page, note }, { onSuccess: (result) => setBookmarks(result) });
    } else {
      setBookmarks(setBookmarkNoteLocal(fileId, page, note));
    }
  }

  function removeBookmark(page: number) {
    if (!fileId) return;
    if (isLoggedIn) {
      toggleBookmarkMutation.mutate({ fileId, page }, { onSuccess: (result) => setBookmarks(result) });
    } else {
      setBookmarks(toggleBookmark(fileId, page));
    }
    setEditingBookmarkPage((p) => (p === page ? null : p));
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

  function saveDrawing(pageNumber: number, points: DrawingPoint[]) {
    if (!fileId) return;
    const width = strokeWidthFor(drawTool);
    // A ruler stroke is stored as the pen stroke it is: straightening happened
    // while it was drawn, and nothing downstream needs to know about it.
    const tool = markLeftBy(drawTool);
    if (isLoggedIn) {
      addDrawingMutation.mutate(
        { fileId, page: pageNumber, tool, color: drawColor, strokeWidth: width, points },
        { onSuccess: (created) => setDrawings((prev) => [...prev, created]) },
      );
    } else {
      setDrawings(addDrawingLocal(fileId, { pageNumber, tool, color: drawColor, strokeWidth: width, points }));
    }
  }

  // Erasing deletes whole strokes rather than nibbling holes in them: the ink
  // is stored as strokes, so a partial rub-out would have to split one into
  // two, and "the line I just drew goes away" is what people expect anyway.
  //
  // The hit test reads the ink from a ref and trims that ref as it goes: a drag
  // fires this many times per second, well inside a single React render, and
  // without it the same stroke would be deleted again on every one of them.
  const eraseAt = useCallback(
    (pageNumber: number, point: DrawingPoint, pageAspect: number) => {
      if (!fileId) return;
      const hit = strokesUnderEraser(drawingsRef.current.filter((d) => d.pageNumber === pageNumber), point, pageAspect);
      if (hit.length === 0) return;
      const gone = new Set(hit.map((d) => d.id));
      drawingsRef.current = drawingsRef.current.filter((d) => !gone.has(d.id));
      setDrawings(drawingsRef.current);
      for (const stroke of hit) {
        if (isLoggedIn) removeDrawingMutation.mutate({ id: stroke.id });
        else removeDrawingLocal(fileId, stroke.id);
      }
    },
    [fileId, isLoggedIn, removeDrawingMutation],
  );

  function deleteDrawing(id: string) {
    if (!fileId) return;
    if (isLoggedIn) {
      removeDrawingMutation.mutate({ id }, { onSuccess: () => setDrawings((prev) => prev.filter((d) => d.id !== id)) });
    } else {
      setDrawings(removeDrawingLocal(fileId, id));
    }
  }

  function undoLastDrawing() {
    const onPage = drawings.filter((d) => d.pageNumber === currentPage);
    const last = onPage[onPage.length - 1];
    if (last) deleteDrawing(last.id);
  }

  function clearPageDrawings() {
    if (!fileId) return;
    if (isLoggedIn) {
      clearPageDrawingsMutation.mutate(
        { fileId, page: currentPage },
        { onSuccess: () => setDrawings((prev) => prev.filter((d) => d.pageNumber !== currentPage)) },
      );
    } else {
      setDrawings(clearPageDrawingsLocal(fileId, currentPage));
    }
  }

  // Composites the page's own canvas + the highlight overlay + any ink into
  // one flat image — a faithful screenshot of exactly what's on screen for
  // this one page, not the whole app chrome around it. On a phone this opens
  // the native share sheet directly (LINE, Messenger, etc.); everywhere else
  // it downloads a PNG the reader can send however they like.
  async function capturePage(pageNumber: number) {
    const wrapper = document.getElementById(`pdf-page-${pageNumber}`);
    const baseCanvas = wrapper?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!wrapper || !baseCanvas || baseCanvas.width === 0) {
      alert("หน้านี้ยังโหลดไม่เสร็จ เลื่อนให้หน้านี้ปรากฏเต็มจอก่อนแล้วลองอีกครั้ง");
      return;
    }
    setCapturingPage(true);
    try {
      const canvases = wrapper.querySelectorAll("canvas");
      const drawCanvas = canvases[1] as HTMLCanvasElement | undefined;

      const out = document.createElement("canvas");
      out.width = baseCanvas.width;
      out.height = baseCanvas.height;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("CANVAS_CONTEXT_UNAVAILABLE");
      ctx.drawImage(baseCanvas, 0, 0, out.width, out.height);

      ctx.save();
      ctx.fillStyle = "#e8c168";
      ctx.globalAlpha = 0.4;
      for (const h of highlights.filter((h) => h.pageNumber === pageNumber)) {
        for (const r of h.rects) ctx.fillRect(r.x * out.width, r.y * out.height, r.w * out.width, r.h * out.height);
      }
      ctx.restore();

      if (drawCanvas && drawCanvas.width > 0) ctx.drawImage(drawCanvas, 0, 0, out.width, out.height);

      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("CANVAS_EXPORT_FAILED");

      const displayPage = Math.max(1, pageNumber - pageOffset);
      const fileName = `${safeFileName(title ?? "", "หน้าหนังสือ")} - หน้า ${displayPage}.png`;
      await shareOrSaveImage(blob, fileName, title ?? fileName, `หน้า ${displayPage} จาก ${title ?? "หนังสือ"}`);
    } catch {
      alert("แคปหน้านี้ไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      setCapturingPage(false);
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

  useEffect(() => {
    drawingsRef.current = drawings;
  }, [drawings]);

  const isCurrentPageBookmarked = bookmarks.some((b) => b.pageNumber === currentPage);
  const toolsVisible = !(isFullscreen && toolbarsHidden);

  // Each tool remembers a sensible colour: switching to the highlighter should
  // not leave you painting in near-black, and switching back should not leave
  // the pen writing in yellow.
  function pickDrawTool(tool: DrawToolId) {
    setDrawTool(tool);
    if (tool === "eraser") return;
    const palette = paletteFor(tool);
    setDrawColor((c) => (palette.includes(c) ? c : palette[0]));
  }

  if (status === "error") {
    return (
      <div className="rounded-2xl overflow-hidden border border-navy-900/[0.07] shadow-card">
        <div className="flex flex-col items-center justify-center h-[400px] gap-3 text-center px-6 bg-white">
          <div className="text-red-700">{errorDetail || "เปิดไฟล์ PDF ไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองใหม่อีกครั้ง"}</div>
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
    <div
      ref={containerRef}
      className={
        isFullscreen
          ? // 100dvh, not 100vh: on iOS and Android the visible viewport shrinks
            // as the browser's own bars appear, and vh keeps reporting the taller
            // figure — which puts the reader's bottom toolbar underneath them.
            "reader-fullscreen fixed inset-0 z-50 flex flex-col bg-navy-950 overflow-hidden h-[100dvh]"
          : "relative rounded-2xl overflow-hidden border border-navy-900/[0.07] shadow-card"
      }
    >
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
      {showLandscapeHint && <LandscapeDocumentHint onOpenFullscreen={enterFullscreen} />}
      <div
        ref={scrollRef}
        className={`overflow-auto bg-navy-900/[0.03] ${isFullscreen ? "flex-1 min-h-0 p-2 sm:p-4" : "max-h-[70vh] p-4 sm:p-6"}`}
      >
        <div style={pinchScale !== 1 ? { transform: `scale(${pinchScale})`, transformOrigin: "top center" } : undefined}>
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
                drawings={drawings.filter((d) => d.pageNumber === n)}
                drawTool={drawTool}
                drawColor={drawColor}
                drawEnabled={!!fileId}
                drawMode={drawMode}
                onStrokeComplete={saveDrawing}
                onErase={eraseAt}
              />
            ))}
        </div>
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

      {/* Fullscreen exists to give the page the whole screen, and three bars of
          chrome take a third of it back on a phone held sideways. So in
          fullscreen every bar folds away together — and the page counter that
          replaces them brings them back in one tap, so the pen and the
          highlighter are never more than that one tap out of reach. */}
      {toolsVisible && (
        <>
        {/* Placed below the scroll area (not above) so it stays within thumb reach on mobile. */}
        <div className="flex items-center justify-center gap-5 sm:gap-8 py-3 bg-navy-950 text-ivory shrink-0">
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

        <div
          className={`reader-toolbar flex flex-wrap items-center justify-center gap-2 sm:gap-3 py-2.5 px-3 bg-white border-t border-navy-900/[0.06] text-sm ${
            isFullscreen ? "shrink-0" : ""
          }`}
          style={isFullscreen ? { paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" } : undefined}
        >
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? "ออกจากโหมดเต็มจอ" : "ดูแบบเต็มจอ"}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors ${
              isFullscreen
                ? "border-gold-500/50 text-gold-700 bg-gold-400/10"
                : "border-navy-900/15 text-navy-700 hover:border-gold-500 hover:bg-gold-400/5"
            }`}
          >
            {isFullscreen ? <IconCollapse width={15} height={15} /> : <IconExpand width={15} height={15} />}
            <span className="reader-label">{isFullscreen ? "ออกเต็มจอ" : "เต็มจอ"}</span>
          </button>
          {isFullscreen && (
            <button
              type="button"
              onClick={() => setToolbarsHidden(true)}
              title="ซ่อนแถบเครื่องมือ ให้เหลือแต่หน้าหนังสือ"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-navy-900/15 text-navy-700 hover:border-gold-500 hover:bg-gold-400/5 transition-colors"
            >
              <IconChevronDown width={15} height={15} />
              <span className="reader-label">ซ่อนเครื่องมือ</span>
            </button>
          )}
          <span className="reader-divider w-px h-5 bg-navy-900/10 hidden sm:block" aria-hidden />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={zoomOut}
              disabled={zoomLevel <= MIN_ZOOM}
              aria-label="ซูมออก"
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-navy-900/15 text-navy-700 font-semibold hover:border-gold-500 hover:bg-gold-400/5 disabled:opacity-30 transition-colors"
            >
              −
            </button>
            <button
              type="button"
              onClick={resetZoom}
              title="รีเซ็ตเป็น 100%"
              className="w-12 text-center tabular-nums text-navy-700 hover:text-gold-700 transition-colors"
            >
              {Math.round(zoomLevel * 100)}%
            </button>
            <button
              type="button"
              onClick={zoomIn}
              disabled={zoomLevel >= MAX_ZOOM}
              aria-label="ซูมเข้า"
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-navy-900/15 text-navy-700 font-semibold hover:border-gold-500 hover:bg-gold-400/5 disabled:opacity-30 transition-colors"
            >
              +
            </button>
          </div>
          {fileId && (
            <>
              <span className="reader-divider w-px h-5 bg-navy-900/10 hidden sm:block" aria-hidden />
              <button
                type="button"
                onClick={() => setDrawToolbarOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border transition-colors ${
                  drawToolbarOpen
                    ? "border-gold-500/50 text-gold-700 bg-gold-400/10"
                    : "border-navy-900/15 text-navy-700 hover:border-gold-500 hover:bg-gold-400/5"
                }`}
              >
                <IconPen width={14} height={14} />
                <span className="reader-label">เครื่องมือวาด</span>
              </button>
            </>
          )}
          <span className="reader-divider w-px h-5 bg-navy-900/10 hidden sm:block" aria-hidden />
          <button
            type="button"
            onClick={() => capturePage(currentPage)}
            disabled={capturingPage}
            title="แคปหน้านี้เป็นรูปภาพเพื่อส่งให้คนอื่น"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-navy-900/15 text-navy-700 hover:border-gold-500 hover:bg-gold-400/5 disabled:opacity-40 transition-colors"
          >
            <IconCamera width={15} height={15} />
            <span className="reader-label">{capturingPage ? "กำลังแคป..." : "แคปหน้านี้"}</span>
          </button>
          <span className="reader-divider w-px h-5 bg-navy-900/10 hidden sm:block" aria-hidden />
          <form onSubmit={onJumpSubmit} className="flex items-center gap-1.5">
            <label htmlFor="pdf-jump-input" className="reader-label text-navy-700/55 text-xs sm:text-sm">
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
              <span className="reader-divider w-px h-5 bg-navy-900/10 hidden sm:block" aria-hidden />
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
                <span className="reader-label">{isCurrentPageBookmarked ? "คั่นหน้านี้แล้ว" : "คั่นหน้านี้"}</span>
              </button>
              <BookmarkMenu
                bookmarks={bookmarks}
                pageOffset={pageOffset}
                open={bookmarksOpen}
                onOpenChange={setBookmarksOpen}
                editingPage={editingBookmarkPage}
                onEditingPageChange={setEditingBookmarkPage}
                onGoToPage={goToPage}
                onSaveNote={saveBookmarkNote}
                onRemove={removeBookmark}
              />
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

        {fileId && drawToolbarOpen && (
          // shrink-0 so a short landscape phone clips the page rather than the
          // stationery, and reader-toolbar folds this row down to one scrollable
          // line there, the same way the bar above it already collapses.
          <div className="reader-toolbar shrink-0 flex flex-wrap items-center gap-3 py-2.5 px-3 bg-navy-900/[0.03] border-t border-navy-900/[0.06] text-sm">
            <div className="flex items-center gap-1 rounded-lg border border-navy-900/15 p-0.5 bg-white">
              {DRAW_TOOLS.map(({ id, label, Icon, hint }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => pickDrawTool(id)}
                  title={hint}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
                    drawTool === id ? "bg-navy-950 text-ivory" : "text-navy-700 hover:bg-navy-900/5"
                  }`}
                >
                  <Icon width={14} height={14} /> {label}
                </button>
              ))}
            </div>

            {/* The eraser has no colour of its own — a palette beside it would
                only suggest it erases one colour at a time. */}
            {drawTool !== "eraser" && (
              <div className="flex items-center gap-1.5">
                {paletteFor(drawTool).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDrawColor(c)}
                    aria-label={`สี ${c}`}
                    style={{ backgroundColor: c }}
                    className={`w-6 h-6 rounded-full transition-transform ${
                      drawColor === c ? "ring-2 ring-offset-2 ring-gold-500 scale-105" : "hover:scale-105"
                    }`}
                  />
                ))}
              </div>
            )}

            <span className="w-px h-5 bg-navy-900/10" aria-hidden />

            <button
              type="button"
              onClick={() => setDrawMode((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border transition-colors ${
                drawMode
                  ? "border-gold-500/50 text-gold-700 bg-gold-400/10"
                  : "border-navy-900/15 text-navy-700 hover:border-gold-500 hover:bg-gold-400/5"
              }`}
              title="เปิดไว้เพื่อวาด/ลบด้วยนิ้วหรือเมาส์ได้ (ปากกาสไตลัสใช้ได้เสมอไม่ต้องเปิด)"
            >
              {drawMode ? "วาดด้วยนิ้วเปิดอยู่" : "วาดด้วยนิ้ว: ปิด"}
            </button>

            <button
              type="button"
              onClick={undoLastDrawing}
              disabled={!drawings.some((d) => d.pageNumber === currentPage)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-navy-900/15 text-navy-700 hover:border-gold-500 hover:bg-gold-400/5 disabled:opacity-30 transition-colors"
            >
              <IconUndo width={14} height={14} /> ย้อนกลับ
            </button>

            <button
              type="button"
              onClick={clearPageDrawings}
              disabled={!drawings.some((d) => d.pageNumber === currentPage)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-navy-900/15 text-red-700 hover:border-red-400 hover:bg-red-50 disabled:opacity-30 transition-colors"
            >
              <IconTrash width={14} height={14} /> ล้างหน้านี้
            </button>
          </div>
        )}

        </>
      )}

      {isFullscreen && toolbarsHidden && (
        <button
          type="button"
          onClick={() => setToolbarsHidden(false)}
          title="แสดงแถบเครื่องมือ"
          className="absolute right-4 z-20 inline-flex items-center gap-2 rounded-full bg-navy-950/85 text-ivory pl-4 pr-3 py-2 text-sm font-medium shadow-card-hover backdrop-blur-sm"
          style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <span className="tabular-nums">
            {currentPage}
            <span className="text-ivory/35 mx-1">/</span>
            {numPages}
          </span>
          <IconChevronUp width={16} height={16} className="text-gold-400" />
        </button>
      )}

      {showRotateHint && (
        <RotateDeviceOverlay onDismiss={() => setRotateHintDismissed(true)} onExitFullscreen={exitFullscreen} />
      )}
    </div>
  );
});

export default PdfReader;

function PageSlot({
  doc,
  pageNumber,
  pageWidth,
  defaultAspect,
  onInView,
  highlights,
  drawings,
  drawTool,
  drawColor,
  drawEnabled,
  drawMode,
  onStrokeComplete,
  onErase,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  pageWidth: number;
  defaultAspect: number;
  onInView: (pageNumber: number) => void;
  highlights: Highlight[];
  drawings: Drawing[];
  drawTool: DrawToolId;
  drawColor: string;
  /** Whether this reader even has somewhere to save a stroke (needs a fileId). */
  drawEnabled: boolean;
  /** Off: only a real stylus (pointerType "pen") draws — finger/mouse keep scrolling/selecting.
   *  On: finger and mouse draw too, for phones/tablets without a stylus. */
  drawMode: boolean;
  onStrokeComplete: (pageNumber: number, points: DrawingPoint[]) => void;
  /** Eraser only. `pageAspect` lets the caller keep the eraser round on a page of any shape. */
  onErase: (pageNumber: number, point: DrawingPoint, pageAspect: number) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const activeStrokeRef = useRef<DrawingPoint[] | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
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
      // whatever size the canvas is actually displayed at (its CSS box).
      // pageWidth already includes the reader's zoom level, so the render
      // resolution scales up with it — otherwise zooming in would just
      // blow up a fixed-resolution image instead of getting sharper.
      const cssScale = pageWidth / unscaledViewport.width;
      // devicePixelRatio-aware so the canvas isn't blurrily upscaled on Retina/HiDPI
      // screens, capped at 2x so an extreme zoom + a 3x-DPR device doesn't blow past
      // what a canvas can comfortably hold in memory.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: cssScale * dpr });

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

  function paintStroke(
    ctx: CanvasRenderingContext2D,
    points: DrawingPoint[],
    color: string,
    widthFraction: number,
    isHighlighter: boolean,
    cssWidth: number,
    cssHeight: number,
  ) {
    if (points.length < 2) return;
    ctx.save();
    ctx.globalAlpha = isHighlighter ? 0.4 : 1;
    // A highlighter should darken what's under it like a real marker, not
    // sit as a flat opaque block on top of the text.
    ctx.globalCompositeOperation = isHighlighter ? "multiply" : "source-over";
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, widthFraction * cssWidth);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(points[0].x * cssWidth, points[0].y * cssHeight);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x * cssWidth, points[i].y * cssHeight);
    ctx.stroke();
    ctx.restore();
  }

  function redrawStrokes(inProgress?: DrawingPoint[]) {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const cssWidth = pageWidth;
    const cssHeight = pageWidth * aspect;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(cssWidth * dpr);
    const targetH = Math.round(cssHeight * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    for (const d of drawings) paintStroke(ctx, d.points, d.color, d.strokeWidth, d.tool === "highlighter", cssWidth, cssHeight);
    if (inProgress && drawTool !== "eraser") {
      paintStroke(ctx, inProgress, drawColor, strokeWidthFor(drawTool), drawTool === "highlighter", cssWidth, cssHeight);
    }
  }

  // Redraws whenever the saved strokes change, or the page resizes/rezooms
  // (stored points are page-relative fractions, so they need re-projecting
  // to pixels any time the page's own pixel size changes).
  useEffect(() => {
    if (!rendered) return;
    redrawStrokes();
  }, [rendered, drawings, pageWidth, aspect]);

  function pointFromEvent(e: React.PointerEvent): DrawingPoint | null {
    const el = wrapperRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  }

  // A real stylus always draws (that's the whole point of a stylus on a
  // reading app); a finger or mouse only draws when the reader has
  // explicitly turned drawing on — otherwise a finger just scrolls and a
  // mouse just selects text, same as before this feature existed. isPrimary
  // excludes a second simultaneous finger, since with draw-mode on, two
  // fingers landing together means "pinch to zoom", not "draw with two hands".
  function eligibleToDraw(e: React.PointerEvent): boolean {
    if (!drawEnabled) return false;
    if (e.pointerType === "pen") return true;
    if (!drawMode || !e.isPrimary) return false;
    if (e.pointerType === "mouse" && e.button !== 0) return false;
    return true;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (activePointerIdRef.current !== null) {
      // A second pointer landed mid-stroke — this is turning into a pinch/
      // multi-touch gesture, not a drawing stroke. Abandon the partial
      // stroke and hand off to the pinch-zoom handling one level up.
      activeStrokeRef.current = null;
      activePointerIdRef.current = null;
      redrawStrokes();
      return;
    }
    if (!eligibleToDraw(e)) return;
    const pt = pointFromEvent(e);
    if (!pt) return;
    e.preventDefault();
    activeStrokeRef.current = [pt];
    activePointerIdRef.current = e.pointerId;
    // The eraser bites as it is dragged rather than on release, so a tap
    // straight onto a stroke rubs it out without having to move first.
    if (drawTool === "eraser") onErase(pageNumber, pt, aspect);
    // Can throw if the browser doesn't consider this pointerId an active
    // session (seen with synthetic events; harmless either way here since
    // capture is just an optimization to keep tracking the pointer off-page).
    try {
      wrapperRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // no-op
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (activePointerIdRef.current !== e.pointerId || !activeStrokeRef.current) return;
    const pt = pointFromEvent(e);
    if (!pt) return;
    e.preventDefault();
    if (drawTool === "eraser") {
      onErase(pageNumber, pt, aspect);
      return;
    }
    // A ruler keeps only where the stroke started and where the pointer is now,
    // so what lands on the page is the straight line between the two however the
    // hand wobbled on the way — and it keeps following the pointer until you lift.
    if (drawTool === "ruler") activeStrokeRef.current = [activeStrokeRef.current[0], pt];
    else activeStrokeRef.current.push(pt);
    redrawStrokes(activeStrokeRef.current);
  }

  function endStroke(e: React.PointerEvent) {
    if (activePointerIdRef.current !== e.pointerId) return;
    const points = activeStrokeRef.current;
    activeStrokeRef.current = null;
    activePointerIdRef.current = null;
    try {
      wrapperRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // no-op
    }
    if (drawTool === "eraser") {
      redrawStrokes(); // the erasing already happened as the pointer moved
    } else if (points && points.length >= 2) {
      onStrokeComplete(pageNumber, points);
    } else {
      redrawStrokes(); // a stray tap — wipe its dot back off
    }
  }

  return (
    <div
      ref={wrapperRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
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
          {/* Ink always sits on top and is never itself a click target (pointer-events:none) —
              the wrapper above is what actually listens for pen/finger/mouse strokes, so this
              can stay purely a paint surface without blocking text selection underneath it. */}
          <canvas ref={drawCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 3 }} />
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-navy-700/25 text-sm font-serif">หน้า {pageNumber}</div>
      )}
    </div>
  );
}
