import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { IconBookmark, IconCamera, IconCollapse, IconExpand, IconHighlighter, IconPen, IconSearch, IconTrash, IconUndo } from "./icons";
import { clearHighlights, focusMatch, highlightMatches } from "../lib/searchInPreview";
import { renderElementRegionToCanvas } from "../lib/elementToPng";
import { useReaderFullscreen } from "../lib/useReaderFullscreen";
import { useIsTouchDevice, useOrientation } from "../lib/useViewport";
import RotateDeviceOverlay from "./RotateDeviceOverlay";
import LandscapeDocumentHint from "./LandscapeDocumentHint";
import { safeFileName, shareOrSaveImage } from "../lib/shareOrSaveImage";
import {
  addDrawingLocal,
  clearPageDrawingsLocal,
  getBookmarks,
  getDrawings,
  getLastPage,
  removeDrawingLocal,
  saveLastPage,
  toggleBookmark,
  type Drawing,
  type DrawingPoint,
} from "../lib/readingProgress";

interface Sheet {
  name: string;
  html: string;
}

type OfficePreviewProps = ({ kind: "docx"; html: string } | { kind: "xlsx"; sheets: Sheet[] }) & {
  fileId?: string;
  title?: string;
};

// A Word page reads best as a narrow column, the same width the PDF reader
// gives a portrait book. Spreadsheets and slide-shaped content are wide by
// nature and get the landscape stage instead — squeezing a wide table into a
// portrait column produces a wall of wrapped cells nobody can read.
const STAGE_WIDTH_PORTRAIT = 760;
const STAGE_WIDTH_LANDSCAPE = 1180;
const A4_RATIO = 297 / 210;

const MIN_ZOOM = 0.5;
// Fitting a 1180px landscape stage onto a phone held upright needs about 0.3,
// well under the floor that makes sense for the manual zoom buttons — so the
// automatic fit gets its own, lower floor.
const MIN_ZOOM_FIT = 0.15;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.25;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

// Fractions of stage width, matching the PDF reader so a stroke has the same
// weight whichever kind of file it is drawn on.
const TOOL_WIDTH: Record<Drawing["tool"], number> = { pen: 0.0035, highlighter: 0.014 };
const PEN_COLORS = ["#1a1a2e", "#dc2626", "#2563eb", "#16a34a"];
const HIGHLIGHTER_COLORS = ["#facc15", "#f472b6", "#4ade80", "#60a5fa"];

/**
 * A reader for Word and Excel previews, with the same support a book gets in
 * PdfReader: zoom, a stage sized to the document's own shape, remembered
 * reading position, bookmarks, freehand pen/highlighter annotation, page
 * capture and in-document search.
 *
 * HTML has no pages, so the content is divided into virtual pages of a fixed
 * height in stage coordinates. That is what lets bookmarks, "jump to page",
 * saved position and per-page capture reuse exactly the same storage and the
 * same mental model as the PDF reader, instead of inventing a second one.
 *
 * The stage is a FIXED pixel width and zoom is a CSS transform, deliberately:
 * if zooming reflowed the text, every saved annotation would drift away from
 * the words it was drawn over.
 */
export default function OfficePreview(props: OfficePreviewProps) {
  const { fileId, title } = props;
  const sheets = props.kind === "xlsx" ? props.sheets : null;
  const [activeSheet, setActiveSheet] = useState(0);
  const html = props.kind === "docx" ? props.html : (sheets?.[activeSheet]?.html ?? "");

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(1);
  const [contentHeight, setContentHeight] = useState(0);
  const [needsWideStage, setNeedsWideStage] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [resumePage, setResumePage] = useState<number | null>(null);
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [drawToolbarOpen, setDrawToolbarOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<Drawing["tool"] | null>(null);
  const [drawColor, setDrawColor] = useState(PEN_COLORS[0]);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [jumpInput, setJumpInput] = useState("");
  const [query, setQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);

  const stageWidth = props.kind === "xlsx" || needsWideStage ? STAGE_WIDTH_LANDSCAPE : STAGE_WIDTH_PORTRAIT;
  const isLandscapeDocument = stageWidth === STAGE_WIDTH_LANDSCAPE;
  // A landscape document's page is wider than it is tall. Deriving its height
  // by multiplying by the A4 ratio (correct for a portrait page) produced a
  // page taller than the portrait one, which no landscape screen could ever
  // fit — the exact thing rotating the phone is supposed to achieve.
  const virtualPageHeight = Math.round(isLandscapeDocument ? stageWidth / A4_RATIO : stageWidth * A4_RATIO);
  const pageCount = Math.max(1, Math.ceil(contentHeight / virtualPageHeight));
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

  useEffect(() => {
    if (!isFullscreen) setRotateHintDismissed(false);
  }, [isFullscreen]);

  // --- sizing -------------------------------------------------------------

  // Measured after layout so the first paint already has the right scroll
  // height, rather than flashing a collapsed stage.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => {
      setContentHeight(el.scrollHeight);
      // A Word file can still contain a table far wider than a portrait
      // column; give it the landscape stage rather than clipping it.
      setNeedsWideStage(el.scrollWidth > STAGE_WIDTH_PORTRAIT + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [html, stageWidth]);

  // Fullscreen exists to show one whole page at once, so the zoom is chosen to
  // fit the page rather than left at whatever the reader last set. Re-fitting
  // on every resize is what makes turning the phone sideways do the thing the
  // rotate prompt promised: the page grows to fill the new shape.
  //
  // A manual zoom after that is respected until the next resize — someone who
  // zoomed in to read small print should not have it snatched back, but a
  // rotation is a clear "re-lay this out" signal.
  const manuallyZoomedRef = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isFullscreen || contentHeight === 0) return;
    const fitPage = () => {
      manuallyZoomedRef.current = false;
      const availableWidth = el.clientWidth - 32;
      const availableHeight = el.clientHeight - 32;
      // Only a landscape document is fitted whole. Squeezing a portrait page
      // into a sideways phone by its height would leave the text a third of
      // its readable size; those fill the width and scroll, as reading does.
      const scale = isLandscapeDocument
        ? Math.min(availableWidth / stageWidth, availableHeight / virtualPageHeight)
        : availableWidth / stageWidth;
      setZoom(Math.max(MIN_ZOOM_FIT, Math.min(MAX_ZOOM, Math.round(scale * 100) / 100)));
    };
    fitPage();
    const observer = new ResizeObserver(() => {
      if (!manuallyZoomedRef.current) fitPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
    // `orientation` is a dependency as well as a ResizeObserver trigger: the
    // observer covers the container changing shape, but re-running on the
    // rotation itself is what guarantees the promise the rotate prompt made,
    // without depending on which resize signal a given browser chose to send.
  }, [isFullscreen, contentHeight, stageWidth, virtualPageHeight, isLandscapeDocument, orientation]);

  // --- reading position, bookmarks, drawings ------------------------------

  useEffect(() => {
    if (!fileId) return;
    const saved = getLastPage(fileId);
    if (saved && saved > 1) setResumePage(saved);
    setBookmarks(getBookmarks(fileId));
    setDrawings(getDrawings(fileId));
  }, [fileId]);

  useEffect(() => {
    if (!fileId) return;
    saveLastPage(fileId, currentPage);
  }, [fileId, currentPage]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const stageY = el.scrollTop / zoom;
    setCurrentPage(Math.min(pageCount, Math.floor(stageY / virtualPageHeight) + 1));
  }, [zoom, pageCount, virtualPageHeight]);

  const goToPage = useCallback(
    (page: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const target = Math.min(Math.max(1, page), pageCount);
      el.scrollTo({ top: (target - 1) * virtualPageHeight * zoom, behavior: "smooth" });
      setResumePage(null);
    },
    [pageCount, virtualPageHeight, zoom],
  );

  function onToggleBookmark() {
    if (!fileId) return;
    setBookmarks(toggleBookmark(fileId, currentPage));
  }

  // --- zoom ---------------------------------------------------------------

  // Ctrl/⌘ + wheel and trackpad pinch both arrive as a wheel event with
  // ctrlKey set; without preventDefault the browser zooms the whole page
  // instead of the document.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      manuallyZoomedRef.current = true;
      setZoom((z) => clampZoom(z - Math.sign(e.deltaY) * 0.1));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // --- drawing ------------------------------------------------------------

  /** Pointer position in stage coordinates, independent of zoom and scroll. */
  function toStagePoint(e: React.PointerEvent): { stageX: number; stageY: number } | null {
    const canvas = drawCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { stageX: (e.clientX - rect.left) / zoom, stageY: (e.clientY - rect.top) / zoom };
  }

  const strokeRef = useRef<{ page: number; points: DrawingPoint[] } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (!activeTool || !fileId) return;
    const point = toStagePoint(e);
    if (!point) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const page = Math.floor(point.stageY / virtualPageHeight) + 1;
    strokeRef.current = {
      page,
      points: [{ x: point.stageX / stageWidth, y: (point.stageY - (page - 1) * virtualPageHeight) / virtualPageHeight }],
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const stroke = strokeRef.current;
    if (!stroke || !activeTool) return;
    const point = toStagePoint(e);
    if (!point) return;
    stroke.points.push({
      x: point.stageX / stageWidth,
      y: (point.stageY - (stroke.page - 1) * virtualPageHeight) / virtualPageHeight,
    });
    redraw();
  }

  function onPointerUp() {
    const stroke = strokeRef.current;
    strokeRef.current = null;
    if (!stroke || !activeTool || !fileId || stroke.points.length < 2) {
      redraw();
      return;
    }
    setDrawings(
      addDrawingLocal(fileId, {
        pageNumber: stroke.page,
        tool: activeTool,
        color: drawColor,
        strokeWidth: TOOL_WIDTH[activeTool],
        points: stroke.points,
      }),
    );
  }

  function undoLastDrawing() {
    if (!fileId) return;
    const onThisPage = drawings.filter((d) => d.pageNumber === currentPage);
    const last = onThisPage[onThisPage.length - 1];
    if (last) setDrawings(removeDrawingLocal(fileId, last.id));
  }

  function clearCurrentPageDrawings() {
    if (!fileId) return;
    setDrawings(clearPageDrawingsLocal(fileId, currentPage));
  }

  const paintStroke = useCallback(
    (ctx: CanvasRenderingContext2D, stroke: { pageNumber: number; tool: Drawing["tool"]; color: string; strokeWidth: number; points: DrawingPoint[] }, dpr: number) => {
      if (stroke.points.length === 0) return;
      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.strokeWidth * stageWidth * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = stroke.tool === "highlighter" ? 0.35 : 1;
      ctx.beginPath();
      stroke.points.forEach((p, i) => {
        const x = p.x * stageWidth * dpr;
        const y = ((stroke.pageNumber - 1) * virtualPageHeight + p.y * virtualPageHeight) * dpr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    },
    [stageWidth, virtualPageHeight],
  );

  const redraw = useCallback(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas || contentHeight === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(stageWidth * dpr);
    canvas.height = Math.round(contentHeight * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const d of drawings) paintStroke(ctx, d, dpr);
    const live = strokeRef.current;
    if (live && activeTool) {
      paintStroke(ctx, { pageNumber: live.page, tool: activeTool, color: drawColor, strokeWidth: TOOL_WIDTH[activeTool], points: live.points }, dpr);
    }
  }, [contentHeight, stageWidth, drawings, activeTool, drawColor, paintStroke]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // --- capture ------------------------------------------------------------

  async function captureCurrentPage() {
    const content = contentRef.current;
    if (!content) return;
    setCapturing(true);
    setCaptureError(null);
    try {
      const pixelRatio = 2;
      const canvas = await renderElementRegionToCanvas(content, {
        width: stageWidth,
        height: virtualPageHeight,
        offsetY: (currentPage - 1) * virtualPageHeight,
        background: "#ffffff",
        pixelRatio,
      });

      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Annotations are painted on afterwards, in the same coordinate space,
        // so a captured page carries the reader's own marks like the PDF one.
        ctx.save();
        ctx.translate(0, -(currentPage - 1) * virtualPageHeight * pixelRatio);
        for (const d of drawings.filter((d) => d.pageNumber === currentPage)) paintStroke(ctx, d, pixelRatio);
        ctx.restore();
      }

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("CANVAS_EXPORT_FAILED");

      const label = props.kind === "xlsx" ? `${sheets?.[activeSheet]?.name ?? "แผ่นงาน"} - หน้า ${currentPage}` : `หน้า ${currentPage}`;
      const name = `${safeFileName(title ?? "เอกสาร", "เอกสาร")} - ${label}.png`;
      await shareOrSaveImage(blob, name, title ?? name, `${label} จาก ${title ?? "เอกสาร"}`);
    } catch {
      setCaptureError("แคปหน้านี้ไม่สำเร็จ ลองเลื่อนให้หน้านี้แสดงเต็มจอแล้วลองอีกครั้ง");
    } finally {
      setCapturing(false);
    }
  }

  // --- search -------------------------------------------------------------

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    if (!query.trim()) {
      clearHighlights(container);
      setMatchCount(0);
      setCurrentMatch(0);
      return;
    }
    const marks = highlightMatches(container, query);
    setMatchCount(marks.length);
    setCurrentMatch(0);
    if (marks.length > 0) focusMatch(marks, 0);
  }, [html, query]);

  function goToMatch(delta: number) {
    const container = contentRef.current;
    if (!container || matchCount === 0) return;
    const marks = Array.from(container.querySelectorAll<HTMLElement>("mark.preview-search-match"));
    const next = (currentMatch + delta + marks.length) % marks.length;
    setCurrentMatch(next);
    focusMatch(marks, next);
  }

  const isCurrentPageBookmarked = useMemo(() => bookmarks.includes(currentPage), [bookmarks, currentPage]);
  const toolColors = activeTool === "highlighter" ? HIGHLIGHTER_COLORS : PEN_COLORS;

  return (
    <div
      ref={containerRef}
      className={
        isFullscreen
          ? // 100dvh rather than 100vh: mobile browsers keep reporting the taller
            // pre-scroll height for vh, which hides the bottom toolbar behind
            // their own bars.
            "reader-fullscreen fixed inset-0 z-50 flex flex-col bg-navy-950 overflow-hidden h-[100dvh]"
          : "relative"
      }
    >
      {resumePage && (
        <div className="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-gold-500/40 bg-gold-400/5 px-4 py-2.5 text-sm">
          <span className="text-navy-800">อ่านค้างไว้ที่หน้า {resumePage}</span>
          <button type="button" onClick={() => goToPage(resumePage)} className="font-medium text-gold-700 underline underline-offset-2 hover:no-underline">
            อ่านต่อ
          </button>
          <button type="button" onClick={() => setResumePage(null)} className="text-navy-700/55 hover:text-navy-900">
            เริ่มจากต้น
          </button>
        </div>
      )}

      {captureError && <div className="mx-4 mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{captureError}</div>}

      {sheets && sheets.length > 1 && (
        <div className="reader-tabs flex gap-1 px-4 pt-3 overflow-x-auto border-b border-navy-900/10">
          {sheets.map((sheet, i) => (
            <button
              key={sheet.name}
              type="button"
              onClick={() => {
                setActiveSheet(i);
                setCurrentPage(1);
                scrollRef.current?.scrollTo({ top: 0 });
              }}
              className={`px-3.5 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors ${i === activeSheet ? "bg-gold-400/15 text-gold-700 border-b-2 border-gold-500" : "text-navy-700/60 hover:text-navy-900"}`}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      {showLandscapeHint && <LandscapeDocumentHint onOpenFullscreen={enterFullscreen} />}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={`overflow-auto bg-navy-900/[0.03] px-4 py-4 ${isFullscreen ? "flex-1 min-h-0" : "max-h-[70vh]"}`}
      >
        {/* Sizer: gives the scroll container the scaled dimensions, since a
            CSS transform does not affect layout. */}
        <div style={{ width: stageWidth * zoom, height: contentHeight * zoom }} className="mx-auto">
          <div style={{ width: stageWidth, transform: `scale(${zoom})`, transformOrigin: "top left" }} className="relative bg-white shadow-card rounded-lg">
            <div
              ref={contentRef}
              className="office-preview p-8 prose prose-sm max-w-none [&_table]:border-collapse [&_td]:border [&_td]:border-navy-900/15 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-navy-900/15 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-navy-900/5"
              dangerouslySetInnerHTML={{ __html: html }}
            />
            <canvas
              ref={drawCanvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                width: stageWidth,
                height: contentHeight,
                touchAction: activeTool ? "none" : undefined,
                pointerEvents: activeTool ? "auto" : "none",
                cursor: activeTool ? "crosshair" : undefined,
              }}
              className="absolute inset-0"
            />
          </div>
        </div>
      </div>

      {/* The controls sit BELOW the document, within thumb reach on a phone
          and out of the way of the first line of text. In fullscreen they also
          clear the home indicator via the safe-area inset. */}
      <div
        className={`reader-toolbar bg-white border-t border-navy-900/10 px-4 py-3 space-y-2 text-sm ${isFullscreen ? "shrink-0" : ""}`}
        style={isFullscreen ? { paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" } : undefined}
      >
        <div className="reader-row flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="reader-search relative flex-1">
            <IconSearch width={15} height={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-700/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") goToMatch(e.shiftKey ? -1 : 1);
              }}
              placeholder="ค้นหาข้อความในไฟล์นี้..."
              className="w-full rounded-lg border border-navy-900/15 pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400/60"
            />
          </div>
          {query.trim() && (
            <div className="flex items-center gap-2 text-sm text-navy-700/70 shrink-0">
              <span className="tabular-nums">{matchCount > 0 ? `${currentMatch + 1}/${matchCount}` : "ไม่พบ"}</span>
              <button type="button" onClick={() => goToMatch(-1)} disabled={matchCount === 0} className="px-2 py-1 rounded-md border border-navy-900/15 hover:border-gold-500 disabled:opacity-30" aria-label="ผลลัพธ์ก่อนหน้า">
                ↑
              </button>
              <button type="button" onClick={() => goToMatch(1)} disabled={matchCount === 0} className="px-2 py-1 rounded-md border border-navy-900/15 hover:border-gold-500 disabled:opacity-30" aria-label="ผลลัพธ์ถัดไป">
                ↓
              </button>
            </div>
          )}
        </div>

        <div className="reader-row flex flex-wrap items-center gap-2 text-sm">
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
          <span className="reader-divider w-px h-5 bg-navy-900/10 hidden sm:block" aria-hidden />
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => {
                manuallyZoomedRef.current = true;
                setZoom((z) => clampZoom(z - ZOOM_STEP));
              }} disabled={zoom <= MIN_ZOOM} className="w-7 h-7 rounded-lg border border-navy-900/15 text-navy-700 hover:border-gold-500 disabled:opacity-30" aria-label="ย่อ">
              −
            </button>
            <span className="tabular-nums text-navy-700/70 w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => {
                manuallyZoomedRef.current = true;
                setZoom((z) => clampZoom(z + ZOOM_STEP));
              }} disabled={zoom >= MAX_ZOOM} className="w-7 h-7 rounded-lg border border-navy-900/15 text-navy-700 hover:border-gold-500 disabled:opacity-30" aria-label="ขยาย">
              +
            </button>
          </div>

          <span className="reader-divider w-px h-5 bg-navy-900/10 hidden sm:block" aria-hidden />
          <span className="text-navy-700/55 tabular-nums">
            หน้า {currentPage}/{pageCount}
          </span>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(jumpInput);
              if (Number.isFinite(n) && n >= 1) goToPage(n);
            }}
            className="flex items-center gap-1.5"
          >
            <input type="number" min={1} value={jumpInput} onChange={(e) => setJumpInput(e.target.value)} className="w-16 px-2 py-1 rounded-lg border border-navy-900/15 tabular-nums focus:outline-none focus:ring-2 focus:ring-gold-400/60" aria-label="ไปหน้า" />
            <button type="submit" className="px-3 py-1 rounded-lg border border-navy-900/15 font-medium text-navy-800 hover:border-gold-500 hover:bg-gold-400/5">
              ไป
            </button>
          </form>

          {fileId && (
            <>
              <span className="reader-divider w-px h-5 bg-navy-900/10 hidden sm:block" aria-hidden />
              <button type="button" onClick={() => setDrawToolbarOpen((v) => !v)} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border transition-colors ${drawToolbarOpen ? "border-gold-500/50 text-gold-700 bg-gold-400/10" : "border-navy-900/15 text-navy-700 hover:border-gold-500 hover:bg-gold-400/5"}`}>
                <IconPen width={14} height={14} /> <span className="reader-label">เครื่องมือวาด</span>
              </button>
              <button type="button" onClick={onToggleBookmark} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border transition-colors ${isCurrentPageBookmarked ? "border-gold-500/50 text-gold-700 bg-gold-400/10" : "border-navy-900/15 text-navy-700 hover:border-gold-500 hover:bg-gold-400/5"}`}>
                <IconBookmark width={15} height={15} fill={isCurrentPageBookmarked ? "currentColor" : "none"} />
                <span className="reader-label">{isCurrentPageBookmarked ? "คั่นหน้านี้แล้ว" : "คั่นหน้านี้"}</span>
              </button>
              {bookmarks.length > 0 && (
                <div className="relative">
                  <button type="button" onClick={() => setBookmarksOpen((v) => !v)} className="px-3 py-1 rounded-lg border border-navy-900/15 text-navy-700 hover:border-gold-500 hover:bg-gold-400/5">
                    ที่คั่นไว้ ({bookmarks.length})
                  </button>
                  {bookmarksOpen && (
                    <div className="absolute right-0 mt-1 z-10 bg-white border border-navy-900/10 rounded-xl shadow-card py-1 min-w-[9rem] max-h-56 overflow-auto">
                      {bookmarks.map((page) => (
                        <button
                          key={page}
                          type="button"
                          onClick={() => {
                            goToPage(page);
                            setBookmarksOpen(false);
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-gold-400/10 flex items-center gap-2"
                        >
                          <IconBookmark width={12} height={12} className="text-gold-500 shrink-0" fill="currentColor" />
                          หน้า {page}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <span className="reader-divider w-px h-5 bg-navy-900/10 hidden sm:block" aria-hidden />
          <button type="button" onClick={captureCurrentPage} disabled={capturing} title="แคปหน้านี้เป็นรูปภาพเพื่อส่งให้คนอื่น" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-navy-900/15 text-navy-700 hover:border-gold-500 hover:bg-gold-400/5 disabled:opacity-40">
            <IconCamera width={15} height={15} /> <span className="reader-label">{capturing ? "กำลังแคป..." : "แคปหน้านี้"}</span>
          </button>
        </div>

        {drawToolbarOpen && fileId && (
          <div className="flex flex-wrap items-center gap-2 text-sm pt-1 border-t border-navy-900/[0.06]">
            <button type="button" onClick={() => setActiveTool((t) => (t === "pen" ? null : "pen"))} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border ${activeTool === "pen" ? "border-gold-500/50 text-gold-700 bg-gold-400/10" : "border-navy-900/15 text-navy-700 hover:border-gold-500"}`}>
              <IconPen width={14} height={14} /> ปากกา
            </button>
            <button type="button" onClick={() => setActiveTool((t) => (t === "highlighter" ? null : "highlighter"))} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border ${activeTool === "highlighter" ? "border-gold-500/50 text-gold-700 bg-gold-400/10" : "border-navy-900/15 text-navy-700 hover:border-gold-500"}`}>
              <IconHighlighter width={14} height={14} /> ปากกาเน้น
            </button>
            <div className="flex items-center gap-1.5">
              {toolColors.map((c) => (
                <button key={c} type="button" onClick={() => setDrawColor(c)} style={{ backgroundColor: c }} className={`w-5 h-5 rounded-full border border-navy-900/10 transition-transform ${drawColor === c ? "ring-2 ring-offset-2 ring-gold-500" : "hover:scale-105"}`} aria-label={`สี ${c}`} />
              ))}
            </div>
            <button type="button" onClick={undoLastDrawing} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-navy-900/15 text-navy-700 hover:border-gold-500">
              <IconUndo width={14} height={14} /> ย้อนกลับ
            </button>
            <button type="button" onClick={clearCurrentPageDrawings} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-navy-900/15 text-navy-700 hover:border-red-400 hover:text-red-700">
              <IconTrash width={14} height={14} /> ล้างหน้านี้
            </button>
            <span className="text-navy-700/50 text-xs">แตะค้างแล้วลากบนเอกสารเพื่อเขียน</span>
          </div>
        )}
      </div>

      {showRotateHint && (
        <RotateDeviceOverlay onDismiss={() => setRotateHintDismissed(true)} onExitFullscreen={exitFullscreen} />
      )}
    </div>
  );
}
