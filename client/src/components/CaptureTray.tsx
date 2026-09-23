import { useState } from "react";
import type { CaptureTrayApi } from "../lib/useCaptureTray";
import { prefersShareSheet, shareOrSaveImage } from "../lib/shareOrSaveImage";
import { IconClose } from "./icons";

/**
 * The strip under the reader toolbar showing what has been captured so far.
 *
 * The one button that matters is "ส่งต่อหน้าถัดไป": pressing it hands over
 * page 1, then page 2, then page 3 — so sending a run of pages into a chat is
 * press, paste, press, paste, without having to remember which ones have
 * already gone. The counter beside it is the memory the reader would
 * otherwise have to keep themselves.
 */
export default function CaptureTray({ tray }: { tray: CaptureTrayApi }) {
  // How far through the queue the reader has got. Not an index into `pages` —
  // pages can be removed mid-run — but a count of how many have been handed on.
  const [sent, setSent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const sharing = prefersShareSheet();
  const verb = sharing ? "ส่ง" : "คัดลอก";

  if (tray.pages.length === 0) return null;

  async function hand(index: number) {
    const page = tray.pages[index];
    if (!page || busy) return;
    setBusy(true);
    try {
      const delivery = await shareOrSaveImage(page.blob, page.fileName);
      if (delivery === "cancelled") return;
      setSent(index + 1);
      setNote(
        delivery === "downloaded"
          ? `บันทึก ${page.label} เป็นไฟล์แล้ว`
          : `${verb} ${page.label} แล้ว (${index + 1}/${tray.pages.length})` +
              (index + 1 < tray.pages.length ? " — วางแล้วกดอีกครั้งเพื่อเอาหน้าถัดไป" : " — ครบทุกหน้าแล้ว"),
      );
    } finally {
      setBusy(false);
    }
  }

  const nextIndex = sent < tray.pages.length ? sent : 0;
  const nextLabel =
    tray.pages.length === 1
      ? `${verb}หน้านี้`
      : sent === 0
        ? `${verb}ทีละหน้า — เริ่มที่ ${tray.pages[0].label}`
        : sent < tray.pages.length
          ? `${verb}หน้าถัดไป (${tray.pages[nextIndex].label})`
          : `เริ่มใหม่จาก ${tray.pages[0].label}`;

  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-navy-900/[0.06]">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-navy-800">แคปไว้ {tray.pages.length} หน้า</span>
        <button
          type="button"
          onClick={() => hand(nextIndex)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-gold-500/50 text-gold-700 bg-gold-400/10 hover:bg-gold-400/20 disabled:opacity-40 transition-colors"
        >
          {busy ? "กำลังทำ..." : nextLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            tray.clear();
            setSent(0);
            setNote(null);
          }}
          className="text-navy-700/60 hover:text-red-700 hover:underline"
        >
          ล้างทั้งหมด
        </button>
        <span className="text-navy-700/50 text-xs">ยังไม่ได้บันทึกลงเครื่อง — เก็บไว้จนกว่าจะปิดหน้านี้</span>
      </div>

      <ul className="flex flex-wrap gap-2">
        {tray.pages.map((page, i) => (
          <li key={page.id} className="relative">
            <button
              type="button"
              onClick={() => hand(i)}
              disabled={busy}
              title={`${verb} ${page.label}`}
              className={`block w-[54px] h-[70px] rounded-lg overflow-hidden border transition-colors disabled:opacity-40 ${
                i < sent ? "border-emerald-500/60 opacity-60" : "border-navy-900/15 hover:border-gold-500"
              }`}
            >
              <img src={page.url} alt={page.label} className="w-full h-full object-cover object-top bg-white" />
            </button>
            <span className="block text-[11px] text-navy-700/60 text-center mt-0.5 tabular-nums">{page.label}</span>
            <button
              type="button"
              onClick={() => {
                tray.remove(page.id);
                // Dropping a page the reader had already sent would otherwise
                // shift the queue and skip the next one.
                setSent((s) => (i < s ? s - 1 : s));
              }}
              aria-label={`เอา ${page.label} ออก`}
              className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] flex items-center justify-center rounded-full bg-white border border-navy-900/15 text-navy-700/70 hover:text-red-700 hover:border-red-300"
            >
              <IconClose width={10} height={10} />
            </button>
          </li>
        ))}
      </ul>

      {note && <p className="text-xs text-emerald-700">{note}</p>}
    </div>
  );
}
