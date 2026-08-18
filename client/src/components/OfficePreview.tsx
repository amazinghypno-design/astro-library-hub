import { useEffect, useRef, useState } from "react";
import { IconSearch } from "./icons";
import { clearHighlights, focusMatch, highlightMatches } from "../lib/searchInPreview";

interface Sheet {
  name: string;
  html: string;
}

type OfficePreviewProps = { kind: "docx"; html: string } | { kind: "xlsx"; sheets: Sheet[] };

export default function OfficePreview(props: OfficePreviewProps) {
  const sheets = props.kind === "xlsx" ? props.sheets : null;
  const [activeSheet, setActiveSheet] = useState(0);
  const [query, setQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const html = props.kind === "docx" ? props.html : (sheets?.[activeSheet]?.html ?? "");

  // Re-run search whenever the visible content or the query changes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!query.trim()) {
      clearHighlights(container);
      setMatchCount(0);
      setCurrentMatch(0);
      return;
    }
    const marks = highlightMatches(container, query);
    setMatchCount(marks.length);
    const clampedIndex = marks.length > 0 ? 0 : 0;
    setCurrentMatch(clampedIndex);
    if (marks.length > 0) focusMatch(marks, clampedIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, query]);

  function goToMatch(delta: number) {
    const container = containerRef.current;
    if (!container || matchCount === 0) return;
    const marks = Array.from(container.querySelectorAll<HTMLElement>("mark.preview-search-match"));
    const next = (currentMatch + delta + marks.length) % marks.length;
    setCurrentMatch(next);
    focusMatch(marks, next);
  }

  return (
    <div>
      <div className="sticky top-[56px] z-[1] bg-white/95 backdrop-blur border-b border-navy-900/10 px-4 py-3 flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
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
            <button
              type="button"
              onClick={() => goToMatch(-1)}
              disabled={matchCount === 0}
              className="px-2 py-1 rounded-md border border-navy-900/15 hover:border-gold-500 disabled:opacity-30"
              aria-label="ผลลัพธ์ก่อนหน้า"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => goToMatch(1)}
              disabled={matchCount === 0}
              className="px-2 py-1 rounded-md border border-navy-900/15 hover:border-gold-500 disabled:opacity-30"
              aria-label="ผลลัพธ์ถัดไป"
            >
              ↓
            </button>
          </div>
        )}
      </div>

      {sheets && sheets.length > 1 && (
        <div className="flex gap-1 px-4 pt-3 overflow-x-auto border-b border-navy-900/10">
          {sheets.map((sheet, i) => (
            <button
              key={sheet.name}
              type="button"
              onClick={() => setActiveSheet(i)}
              className={`px-3.5 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors ${
                i === activeSheet ? "bg-gold-400/15 text-gold-700 border-b-2 border-gold-500" : "text-navy-700/60 hover:text-navy-900"
              }`}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      <div
        ref={containerRef}
        className="office-preview p-6 max-h-[620px] overflow-auto prose prose-sm max-w-none [&_table]:border-collapse [&_td]:border [&_td]:border-navy-900/15 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-navy-900/15 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-navy-900/5"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
