import { useEffect, useRef, useState } from "react";
import { trpc } from "../lib/trpc";
import { useAdminSession } from "../lib/useAdminSession";
import { explainAdminError } from "../lib/explainAdminError";
import { IconEdit, IconTrash } from "./icons";
import ConfirmDialog from "./ConfirmDialog";

export interface EditableFile {
  id: string;
  title: string;
  author: string | null;
  year: number | null;
  categoryId: string | null;
}

/**
 * The ⋯ menu that hangs off the corner of a file wherever one is shown — a
 * card in the library, a search result, an author's works, the file's own
 * page. One component so the same actions are in the same place everywhere,
 * rather than the corner menu on cards and the real editing buried in the
 * admin table.
 *
 * Admin-only, and only once a real session is confirmed (useAdminSession) —
 * never rendered on a guess about who is looking.
 */
export default function FileActionsMenu({ file, className = "" }: { file: EditableFile; className?: string }) {
  const isAdmin = useAdminSession();
  const utils = trpc.useUtils();
  const categories = trpc.library.categories.useQuery(undefined, { enabled: isAdmin });
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "details" | "category">("menu");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState(file.title);
  const [author, setAuthor] = useState(file.author ?? "");
  const [year, setYear] = useState(file.year != null ? String(file.year) : "");
  const [categoryId, setCategoryId] = useState(file.categoryId ?? "");

  // The same file can be edited from two places at once (a card and the file's
  // own page); whichever saves, the other's draft has to catch up.
  useEffect(() => {
    if (open) return;
    setTitle(file.title);
    setAuthor(file.author ?? "");
    setYear(file.year != null ? String(file.year) : "");
    setCategoryId(file.categoryId ?? "");
  }, [open, file.title, file.author, file.year, file.categoryId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeAll();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Every list on the site reads from the library router, and the admin table
  // from the admin one — invalidating both is what makes an edit made on one
  // page show up on all the others without a reload.
  async function refreshEverything() {
    await Promise.all([utils.library.invalidate(), utils.admin.invalidate()]);
  }

  const updateFile = trpc.admin.updateFile.useMutation({
    onSuccess: async () => {
      await refreshEverything();
      closeAll();
    },
    onError: (err) => alert(explainAdminError(err)),
  });
  const deleteFile = trpc.admin.deleteFile.useMutation({
    onSuccess: async () => {
      await refreshEverything();
      setConfirmingDelete(false);
      setOpen(false);
    },
    onError: (err) => {
      setConfirmingDelete(false);
      alert(explainAdminError(err));
    },
  });

  if (!isAdmin) return null;

  function stop(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function closeAll() {
    setOpen(false);
    setMode("menu");
  }

  function saveDetails() {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    updateFile.mutate({
      id: file.id,
      title: nextTitle,
      // Cleared fields are sent as empty rather than omitted, so removing a
      // wrong author actually removes it instead of silently keeping it.
      author: author.trim(),
      ...(year.trim() ? { year: Number(year) } : {}),
      ...(categoryId ? { categoryId } : {}),
    });
  }

  return (
    <div className={`relative shrink-0 ${className}`} onClick={stop}>
      {/* A pencil in a bordered chip, not a faint ⋯: this menu is the only way
          to fix a file from the page you noticed the mistake on, and a
          40%-opacity glyph in the corner was not read as a button at all. */}
      <button
        type="button"
        onClick={(e) => {
          stop(e);
          setOpen((v) => !v);
        }}
        aria-label="แก้ไขไฟล์นี้"
        aria-haspopup="menu"
        aria-expanded={open}
        title="แก้ไขไฟล์นี้"
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-gold-500/45 bg-gold-400/10 text-gold-700 hover:bg-gold-400/25 hover:text-navy-900 transition-colors"
      >
        <IconEdit width={15} height={15} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[5]" onClick={closeAll} />
          <div
            ref={menuRef}
            role="menu"
            className="absolute right-0 top-8 z-10 w-64 bg-white rounded-xl border border-navy-900/10 shadow-card-hover py-1.5 text-sm overflow-hidden"
            onClick={stop}
          >
            {mode === "menu" && (
              <>
                <MenuItem onClick={() => setMode("details")}>แก้ไขรายละเอียด (ชื่อ ผู้เขียน ปี หมวดหมู่)</MenuItem>
                <MenuItem onClick={() => setMode("category")}>ย้ายหมวดหมู่</MenuItem>
                <div className="h-px bg-navy-900/10 mx-1" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setConfirmingDelete(true)}
                  className="w-full text-left px-3.5 py-2 text-red-700 hover:bg-red-50 transition-colors inline-flex items-center gap-2"
                >
                  <IconTrash width={14} height={14} /> ลบไฟล์
                </button>
              </>
            )}

            {mode === "details" && (
              <div className="px-3.5 py-2 space-y-2.5">
                <Field label="ชื่อเรื่อง">
                  <input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveDetails()}
                    className="w-full rounded-lg border border-navy-900/15 px-2 py-1.5 text-sm bg-white"
                  />
                </Field>
                <Field label="ผู้เขียน">
                  <input
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveDetails()}
                    placeholder="ไม่ระบุ"
                    className="w-full rounded-lg border border-navy-900/15 px-2 py-1.5 text-sm bg-white"
                  />
                </Field>
                <div className="flex gap-2">
                  <Field label="ปี" className="w-20">
                    <input
                      type="number"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveDetails()}
                      className="w-full rounded-lg border border-navy-900/15 px-2 py-1.5 text-sm bg-white"
                    />
                  </Field>
                  <Field label="หมวดหมู่" className="flex-1 min-w-0">
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full rounded-lg border border-navy-900/15 px-2 py-1.5 text-sm bg-white"
                    >
                      <option value="">ยังไม่จัดหมวด</option>
                      {categories.data?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="flex gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={saveDetails}
                    disabled={updateFile.isLoading || !title.trim()}
                    className="flex-1 rounded-lg bg-navy-950 text-ivory text-xs font-medium py-1.5 disabled:opacity-40"
                  >
                    {updateFile.isLoading ? "กำลังบันทึก..." : "บันทึก"}
                  </button>
                  <button type="button" onClick={closeAll} className="rounded-lg border border-navy-900/15 text-xs font-medium px-3 py-1.5">
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}

            {mode === "category" && (
              <div className="px-3.5 py-2">
                <Field label="ย้ายไปหมวดหมู่">
                  <select
                    autoFocus
                    defaultValue={file.categoryId ?? ""}
                    onChange={(e) => e.target.value && updateFile.mutate({ id: file.id, categoryId: e.target.value })}
                    className="w-full rounded-lg border border-navy-900/15 px-2 py-1.5 text-sm bg-white"
                  >
                    <option value="" disabled>
                      เลือกหมวดหมู่
                    </option>
                    {categories.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title="ลบไฟล์นี้ถาวร?"
        message="ลบแล้วกู้คืนไม่ได้ ไฟล์และข้อมูลจะหายจากระบบทันที"
        isBusy={deleteFile.isLoading}
        onConfirm={() => deleteFile.mutate({ id: file.id })}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full text-left px-3.5 py-2 text-navy-800 hover:bg-navy-900/5 transition-colors"
    >
      {children}
    </button>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-navy-700/60 block mb-1">{label}</label>
      {children}
    </div>
  );
}
