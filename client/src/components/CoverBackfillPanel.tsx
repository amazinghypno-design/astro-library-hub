import { useRef, useState } from "react";
import { trpc } from "../lib/trpc";
import { renderCoverFromUrl } from "../lib/renderCover";

/**
 * Covers are made in the browser, so books uploaded before covers existed
 * cannot be given one by a server-side script — there is no canvas on the
 * server and no spare CPU on the free instance to add one. This panel is that
 * backfill: the admin opens it once, and the same code that runs at upload
 * time runs here over every PDF that has no cover yet.
 *
 * Strictly one book at a time. Each one costs a presigned URL, a few hundred
 * KB of range requests and a page render, and running twenty at once would
 * only trade a shorter wait for a stalled browser and a burst of storage
 * requests that R2 charges for.
 */
export default function CoverBackfillPanel() {
  const utils = trpc.useUtils();
  const missing = trpc.admin.filesMissingCover.useQuery();
  const saveCover = trpc.admin.saveCover.useMutation();

  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  // A ref, not state: the loop below reads it after every await, and a state
  // value captured in that closure would never change.
  const cancelRef = useRef(false);

  const total = missing.data?.length ?? 0;

  async function run() {
    if (!missing.data || missing.data.length === 0) return;
    cancelRef.current = false;
    setRunning(true);
    setDone(0);
    setFailed([]);

    for (const file of missing.data) {
      if (cancelRef.current) break;
      setCurrent(file.title);
      try {
        const { url } = await utils.client.admin.coverSourceUrl.query({ fileId: file.id });
        const cover = await renderCoverFromUrl(url);
        if (!cover) throw new Error("RENDER_FAILED");
        await saveCover.mutateAsync({ fileId: file.id, imageBase64: cover.base64 });
        setDone((n) => n + 1);
      } catch {
        // A book pdf.js cannot open keeps its placeholder cover and the run
        // carries on — one unreadable scan must not stop the other forty.
        setFailed((list) => [...list, file.title]);
      }
    }

    setCurrent(null);
    setRunning(false);
    await utils.admin.filesMissingCover.invalidate();
    await utils.library.files.invalidate();
    await utils.library.dashboard.invalidate();
  }

  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-lg font-semibold text-navy-900">ปกหนังสือ</h2>
          <p className="text-sm text-navy-700/60 mt-0.5">
            {missing.isLoading
              ? "กำลังตรวจ..."
              : total === 0
                ? "หนังสือ PDF ทุกเล่มมีปกแล้ว"
                : `มี ${total} เล่มที่ยังไม่มีปก — สร้างจากหน้าแรกของไฟล์`}
          </p>
        </div>
        {total > 0 && !running && (
          <button type="button" onClick={() => void run()} className="btn-gold text-sm px-4 py-2 shrink-0">
            สร้างปกทั้งหมด
          </button>
        )}
        {running && (
          <button
            type="button"
            onClick={() => {
              cancelRef.current = true;
            }}
            className="btn-outline text-sm px-4 py-2 shrink-0"
          >
            หยุด
          </button>
        )}
      </div>

      {(running || done > 0 || failed.length > 0) && (
        <div className="space-y-2">
          <div className="h-1.5 rounded-full bg-navy-900/10 overflow-hidden">
            <div
              className="h-full bg-gold-500 transition-all duration-300"
              style={{ width: `${total === 0 ? 0 : ((done + failed.length) / total) * 100}%` }}
            />
          </div>
          <div className="text-sm text-navy-700/70">
            สำเร็จ {done} เล่ม
            {failed.length > 0 && <span className="text-red-700"> · ไม่สำเร็จ {failed.length} เล่ม</span>}
            {current && <span className="text-navy-700/50"> · กำลังทำ: {current}</span>}
          </div>
          {!running && failed.length > 0 && (
            <div className="text-xs text-navy-700/50">
              อ่านหน้าแรกไม่ได้: {failed.join(", ")} — เล่มเหล่านี้จะใช้ปกสำรองไปก่อน
            </div>
          )}
        </div>
      )}
    </section>
  );
}
