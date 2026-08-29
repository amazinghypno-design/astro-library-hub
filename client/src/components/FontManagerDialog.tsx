import { useState } from "react";
import { trpc } from "../lib/trpc";
import { IconTrash, IconUpload } from "./icons";

/**
 * Bringing a typeface in from outside.
 *
 * The bytes go straight from this browser to object storage through a
 * presigned URL — the same path a book takes (lib/upload.ts) — so a 5MB font
 * never passes through the server. Only the name, format and key are sent to
 * us afterwards.
 *
 * The name matters more than it looks: it is what gets written into every
 * note set in this face (`font-family: …`), so it is asked for up front
 * rather than derived silently from a filename like `NotoSerifThai-Bold.ttf`.
 */

const ACCEPTED = ".ttf,.otf,.woff,.woff2";
const PREVIEW_TEXT = "กขค ฟ้าหม่นเมฆหมอก 123 ABC";

function explainFontError(message: string): string {
  if (message.includes("FONT_FORMAT_UNSUPPORTED")) return "รองรับเฉพาะไฟล์ .ttf .otf .woff และ .woff2";
  if (message.includes("FONT_TOO_LARGE")) return "ไฟล์ฟอนต์ใหญ่เกิน 12MB";
  if (message.includes("FONT_FAMILY_TAKEN")) return "มีฟอนต์ชื่อนี้อยู่แล้ว ตั้งชื่ออื่น";
  if (message.includes("FAMILY_NAME_INVALID")) return "ชื่อฟอนต์ใช้ได้เฉพาะตัวอักษร ตัวเลข เว้นวรรค และขีดกลาง";
  return "อัปโหลดฟอนต์ไม่สำเร็จ ลองใหม่อีกครั้ง";
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export default function FontManagerDialog({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const fonts = trpc.fonts.list.useQuery();
  const [file, setFile] = useState<File | null>(null);
  const [family, setFamily] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createUploadUrl = trpc.fonts.createUploadUrl.useMutation();
  const finalize = trpc.fonts.finalize.useMutation();
  const remove = trpc.fonts.remove.useMutation({
    onSuccess: () => utils.fonts.list.invalidate(),
  });

  function onPick(picked: File | undefined) {
    if (!picked) return;
    setError(null);
    setFile(picked);
    if (!family.trim()) {
      // A sensible starting name, still editable: "NotoSerifThai-Bold.ttf" → "NotoSerifThai-Bold".
      setFamily(picked.name.replace(/\.[^.]+$/, "").replace(/[^\w฀-๿ -]/g, " ").trim().slice(0, 60));
    }
  }

  async function onUpload() {
    if (!file || !family.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const prepared = await createUploadUrl.mutateAsync({ originalName: file.name, size: file.size });
      const put = await fetch(prepared.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": prepared.mimeType },
        body: file,
      });
      if (!put.ok) throw new Error(`UPLOAD_FAILED (${put.status})`);
      await finalize.mutateAsync({
        storageKey: prepared.storageKey,
        family: family.trim(),
        originalName: file.name,
        size: file.size,
      });
      await utils.fonts.list.invalidate();
      setFile(null);
      setFamily("");
    } catch (err) {
      setError(explainFontError(err instanceof Error ? err.message : ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-950/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-card-hover p-5 w-full max-w-xl space-y-5">
        <div>
          <h3 className="font-serif text-lg font-semibold text-navy-900">ฟอนต์ของฉัน</h3>
          <p className="text-sm text-navy-700/70 mt-1">
            อัปโหลดฟอนต์ของคุณเอง (.ttf .otf .woff .woff2) แล้วเลือกใช้ได้จากแถบเครื่องมือในโน้ต
          </p>
        </div>

        <div className="space-y-3 border border-navy-900/10 rounded-xl p-4">
          <label className="btn-outline text-sm py-2 px-3 cursor-pointer inline-flex items-center gap-1.5">
            <IconUpload width={15} height={15} /> เลือกไฟล์ฟอนต์
            <input
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={(e) => {
                onPick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {file && (
            <>
              <p className="text-sm text-navy-800">
                {file.name} <span className="text-navy-700/50">· {formatSize(file.size)}</span>
              </p>
              <div>
                <label className="label-field" htmlFor="font-family-name">
                  ตั้งชื่อฟอนต์ (ชื่อนี้จะขึ้นในเมนูเลือกฟอนต์)
                </label>
                <input
                  id="font-family-name"
                  value={family}
                  onChange={(e) => setFamily(e.target.value)}
                  maxLength={60}
                  className="input-field"
                />
              </div>
              <button type="button" onClick={onUpload} disabled={busy || !family.trim()} className="btn-gold text-sm py-2 px-4">
                {busy ? "กำลังอัปโหลด…" : "อัปโหลดฟอนต์นี้"}
              </button>
            </>
          )}
          {error && <p className="text-red-700 text-sm">{error}</p>}
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {fonts.data?.length === 0 && <p className="text-sm text-navy-700/60">ยังไม่มีฟอนต์ที่อัปโหลดไว้</p>}
          {fonts.data?.map((font) => (
            <div key={font.id} className="flex items-center gap-3 border border-navy-900/10 rounded-xl px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-navy-900 text-sm truncate">{font.family}</p>
                {/* The point of a font is what it looks like — so the row shows it. */}
                <p className="text-lg text-navy-800 truncate" style={{ fontFamily: `"${font.family}"` }}>
                  {PREVIEW_TEXT}
                </p>
                <p className="text-xs text-navy-700/45">
                  {font.originalName} · {formatSize(font.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove.mutate({ id: font.id })}
                aria-label={`ลบฟอนต์ ${font.family}`}
                className="p-2 rounded-lg text-navy-700/40 hover:text-red-700 hover:bg-red-50 shrink-0"
              >
                <IconTrash width={15} height={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="btn-primary text-sm py-2 px-4">
            เสร็จแล้ว
          </button>
        </div>
      </div>
    </div>
  );
}
