import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { trpc } from "../lib/trpc";
import { applyFixes, clearHighlights, highlightIssues, revealFix, type ProofreadFix } from "../lib/proofread";
import { IconSpellCheck } from "./editorIcons";

/**
 * Proofreading, in two presses: check the page, then fix what you agree with.
 *
 * Nothing is changed by the check itself. The suspect words are highlighted
 * where they sit and listed here with what they would become, because a
 * proofreader that silently rewrites a page is impossible to trust — the
 * reader has to be able to see a suggestion and refuse it. Refusing is one
 * click on ✕, and what is left can be applied together or one at a time.
 *
 * After the fix, the words that changed are highlighted in green so the pass
 * can be read back at a glance. Ctrl+Z takes the whole thing back at once.
 *
 * The highlights are view-only decorations, never marks in the document — see
 * lib/proofread.ts — so nothing here can be saved into the note by accident.
 */
export default function ProofreadButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [fixes, setFixes] = useState<ProofreadFix[] | null>(null);
  const [found, setFound] = useState(0);
  const [fixedCount, setFixedCount] = useState<number | null>(null);
  const [unchecked, setUnchecked] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const proofread = trpc.notes.proofread.useMutation({
    onSuccess: (data) => {
      setFixes(data.fixes);
      setUnchecked(data.uncheckedChars);
      setFixedCount(null);
      setFound(highlightIssues(editor, data.fixes));
      setOpen(true);
    },
  });

  // The highlights belong to this check. Closing the panel or leaving the
  // page takes them with it rather than leaving red words behind.
  useEffect(() => () => clearHighlights(editor), [editor]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  function check() {
    const text = editor.getText().trim();
    if (!text) {
      setFixes([]);
      setFound(0);
      setFixedCount(null);
      setUnchecked(0);
      setOpen(true);
      return;
    }
    proofread.mutate({ text });
  }

  function fixAll() {
    if (!fixes?.length) return;
    setFixedCount(applyFixes(editor, fixes));
    setFixes([]);
  }

  function fixOne(fix: ProofreadFix) {
    const applied = applyFixes(editor, [fix]);
    const rest = (fixes ?? []).filter((f) => f !== fix);
    setFixes(rest);
    setFixedCount((count) => (count ?? 0) + applied);
    // Applying one fix replaced the whole highlight set with that one green
    // mark, so the words still to look at are put back.
    if (rest.length) setFound(highlightIssues(editor, rest));
  }

  function dismiss(fix: ProofreadFix) {
    const rest = (fixes ?? []).filter((f) => f !== fix);
    setFixes(rest);
    setFound(highlightIssues(editor, rest));
  }

  function close() {
    clearHighlights(editor);
    setOpen(false);
    setFixes(null);
    setFixedCount(null);
  }

  const busy = proofread.isLoading;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (open ? setOpen(false) : check())}
        disabled={busy}
        title="ตรวจคำผิด / พิสูจน์อักษร"
        aria-label="ตรวจคำผิด"
        aria-expanded={open}
        className={`inline-flex items-center gap-1 h-8 px-1.5 rounded-lg transition-colors disabled:opacity-50 ${
          open ? "bg-navy-950 text-gold-400" : "text-navy-800 hover:bg-navy-900/[0.07]"
        }`}
      >
        <IconSpellCheck width={18} height={18} className={busy ? "animate-pulse" : undefined} />
        {busy && <span className="text-xs">กำลังตรวจ…</span>}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-30 w-max max-w-[24rem] rounded-xl border border-navy-900/10 bg-white shadow-card p-3">
          {proofread.isError && (
            <p className="text-sm text-red-700">
              ตรวจไม่สำเร็จ — {proofread.error?.data?.code === "UNAUTHORIZED" ? "ต้องเข้าสู่ระบบก่อน" : "ลองใหม่อีกครั้ง"}
            </p>
          )}

          {!proofread.isError && fixes?.length === 0 && fixedCount === null && (
            <p className="text-sm text-navy-800">ตรวจแล้ว ไม่พบคำผิด ✓</p>
          )}

          {fixedCount !== null && (
            <div className="text-sm text-navy-800">
              <p className="font-medium text-green-700">แก้ให้แล้ว {fixedCount} จุด</p>
              <p className="text-navy-700/70 mt-0.5">ไฮไลต์เขียวคือคำที่เพิ่งแก้ · กด Ctrl+Z เพื่อย้อนทั้งหมด</p>
            </div>
          )}

          {!!fixes?.length && (
            <>
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <p className="text-sm font-medium text-navy-900">
                  พบ {fixes.length} คำ{found > fixes.length ? ` (${found} ตำแหน่ง)` : ""}
                </p>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={fixAll}
                  className="text-sm px-2.5 py-1 rounded-lg bg-navy-950 text-gold-400 hover:bg-navy-900"
                >
                  แก้ให้ถูกต้องทั้งหมด
                </button>
              </div>
              <ul className="max-h-64 overflow-y-auto -mx-1 px-1 space-y-1">
                {fixes.map((fix, i) => (
                  <li key={`${fix.wrong}-${i}`} className="flex items-center gap-2 text-sm rounded-lg px-2 py-1 hover:bg-gold-400/10">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => revealFix(editor, fix)}
                      title="ไปที่คำนี้ในหน้า"
                      className="flex-1 text-left min-w-0"
                    >
                      <span className="line-through text-red-700">{fix.wrong}</span>
                      <span className="text-navy-700/50 mx-1.5">→</span>
                      <span className="text-green-700 font-medium">{fix.right || "(ลบออก)"}</span>
                      {fix.reason && <span className="block text-[11px] text-navy-700/50 truncate">{fix.reason}</span>}
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => fixOne(fix)}
                      title="แก้เฉพาะคำนี้"
                      className="shrink-0 px-2 py-0.5 rounded-md text-xs bg-green-600/10 text-green-800 hover:bg-green-600/20"
                    >
                      แก้
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => dismiss(fix)}
                      title="ไม่ต้องแก้คำนี้"
                      aria-label="ไม่ต้องแก้คำนี้"
                      className="shrink-0 w-6 h-6 rounded-md text-navy-700/50 hover:bg-navy-900/[0.07]"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {unchecked > 0 && (
            <p className="text-[11px] text-navy-700/50 mt-2">
              หน้านี้ยาวมาก ตรวจได้ถึงส่วนแรกเท่านั้น เหลืออีกราว {unchecked.toLocaleString("th-TH")} ตัวอักษร
            </p>
          )}

          <div className="flex justify-between items-center gap-2 mt-2 pt-2 border-t border-navy-900/10">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={check}
              disabled={busy}
              className="text-xs text-navy-700/70 hover:text-navy-900 disabled:opacity-50"
            >
              ตรวจอีกครั้ง
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={close}
              className="text-xs text-navy-700/70 hover:text-navy-900"
            >
              ปิดและล้างไฮไลต์
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
