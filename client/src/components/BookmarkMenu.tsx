import { useEffect, useRef, useState } from "react";
import { IconBookmark, IconEdit, IconTrash } from "./icons";
import type { Bookmark } from "../lib/readingProgress";

interface BookmarkMenuProps {
  bookmarks: Bookmark[];
  /**
   * Pages the book itself doesn't count — a cover and front matter scanned in
   * with the rest. Stored page numbers are the file's; what a reader is shown
   * is the book's own numbering.
   */
  pageOffset?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The row whose note is being written right now, if any. */
  editingPage: number | null;
  onEditingPageChange: (page: number | null) => void;
  onGoToPage: (page: number) => void;
  onSaveNote: (page: number, note: string) => void;
  onRemove: (page: number) => void;
  /** Which way the panel opens — the PDF toolbar sits at the bottom, Office's at the top. */
  direction?: "up" | "down";
}

/**
 * The list of bookmarked pages, and the one place a reader writes down what
 * each one is about. Shared by both readers (PdfReader, OfficePreview) so the
 * note-editing behaviour can't drift between a PDF and a Word file.
 *
 * Fully controlled: whether the panel is open and which row is being edited
 * both live in the reader, because the reader opens this panel itself — right
 * after a page is bookmarked, with that row's note field already focused. A
 * bookmark that is never described is the thing this feature exists to fix,
 * so the moment of marking is where it asks.
 */
export default function BookmarkMenu({
  bookmarks,
  pageOffset = 0,
  open,
  onOpenChange,
  editingPage,
  onEditingPageChange,
  onGoToPage,
  onSaveNote,
  onRemove,
  direction = "up",
}: BookmarkMenuProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Opening the editor loads the note that is already there, so editing an
  // existing description is a correction rather than a retype.
  useEffect(() => {
    if (editingPage == null) return;
    setDraft(bookmarks.find((b) => b.pageNumber === editingPage)?.note ?? "");
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
    // Only the row being edited should reload the draft — not every save.
  }, [editingPage]);

  if (bookmarks.length === 0) return null;

  const displayPage = (page: number) => Math.max(1, page - pageOffset);

  function commit(page: number) {
    onSaveNote(page, draft.trim());
    onEditingPageChange(null);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="inline-flex items-center gap-1 px-3 py-1 rounded-lg border border-navy-900/15 text-navy-700 hover:border-gold-500 hover:bg-gold-400/5 transition-colors"
      >
        รายการที่คั่น
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-gold-400/20 text-gold-700 text-xs font-semibold">
          {bookmarks.length}
        </span>
        <span className="text-navy-700/40 text-[10px]">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div
          className={`absolute right-0 ${
            direction === "up" ? "bottom-full mb-2" : "top-full mt-2"
          } bg-white border border-navy-900/10 rounded-xl shadow-card-hover py-1.5 w-72 max-h-80 overflow-y-auto z-10`}
        >
          {bookmarks.map((b) => (
            <div key={b.pageNumber} className="group flex items-start gap-1 hover:bg-gold-400/5">
              {editingPage === b.pageNumber ? (
                <div className="flex-1 min-w-0 px-3.5 py-2">
                  <span className="text-xs text-gold-700 font-medium inline-flex items-center gap-1.5">
                    <IconBookmark width={12} height={12} className="text-gold-500 shrink-0" fill="currentColor" />
                    หน้า {displayPage(b.pageNumber)}
                  </span>
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter saves — these are one-line reminders, not paragraphs.
                      // Shift+Enter is still there for the occasional second line.
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        commit(b.pageNumber);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        onEditingPageChange(null);
                      }
                    }}
                    rows={2}
                    maxLength={500}
                    placeholder="หน้านี้เกี่ยวกับอะไร"
                    className="mt-1 w-full px-2 py-1.5 text-sm rounded-lg border border-navy-900/15 text-navy-800 resize-none focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-500"
                  />
                  <div className="flex items-center gap-3 mt-1.5">
                    <button
                      type="button"
                      onClick={() => commit(b.pageNumber)}
                      className="px-2.5 py-1 rounded-lg bg-gold-400/20 text-gold-700 text-xs font-semibold hover:bg-gold-400/30 transition-colors"
                    >
                      บันทึก
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditingPageChange(null)}
                      className="text-xs text-navy-700/50 hover:text-navy-700"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onGoToPage(b.pageNumber);
                      onOpenChange(false);
                    }}
                    className="flex-1 min-w-0 text-left pl-3.5 pr-1.5 py-2 text-navy-800"
                  >
                    <span className="text-xs text-gold-700 font-medium inline-flex items-center gap-1.5">
                      <IconBookmark width={12} height={12} className="text-gold-500 shrink-0" fill="currentColor" />
                      หน้า {displayPage(b.pageNumber)}
                    </span>
                    <span
                      className={`block text-sm mt-0.5 line-clamp-2 ${b.note ? "text-navy-700/80" : "text-navy-700/35 italic"}`}
                    >
                      {b.note || "ยังไม่ได้เขียนว่าหน้านี้เกี่ยวกับอะไร"}
                    </span>
                  </button>
                  <div className="shrink-0 flex items-center gap-0.5 mt-2 mr-2">
                    <button
                      type="button"
                      onClick={() => onEditingPageChange(b.pageNumber)}
                      aria-label={b.note ? `แก้ไขคำอธิบายหน้า ${displayPage(b.pageNumber)}` : `เขียนว่าหน้า ${displayPage(b.pageNumber)} เกี่ยวกับอะไร`}
                      title={b.note ? "แก้ไขคำอธิบาย" : "เขียนว่าหน้านี้เกี่ยวกับอะไร"}
                      className="p-1 rounded text-navy-700/30 hover:text-gold-700 hover:bg-gold-400/10 transition-colors"
                    >
                      <IconEdit width={13} height={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(b.pageNumber)}
                      aria-label={`เอาที่คั่นหน้า ${displayPage(b.pageNumber)} ออก`}
                      title="เอาที่คั่นนี้ออก"
                      className="p-1 rounded text-navy-700/30 hover:text-red-700 hover:bg-red-50 transition-colors"
                    >
                      <IconTrash width={13} height={13} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
