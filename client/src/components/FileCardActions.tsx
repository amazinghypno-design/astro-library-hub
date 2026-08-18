import { useState } from "react";
import { trpc } from "../lib/trpc";
import { useAdminSession } from "../lib/useAdminSession";
import { explainAdminError } from "../lib/explainAdminError";
import { IconTrash } from "./icons";
import ConfirmDialog from "./ConfirmDialog";

/**
 * Small admin-only quick actions (change category, delete) rendered directly
 * on a public file card — only mounts real UI once a real admin session is
 * confirmed (useAdminSession), never guessed from local state. Styled as a
 * compact native-looking context menu, not a form dropped in a box.
 */
export default function FileCardActions({
  fileId,
  title,
  categoryId,
}: {
  fileId: string;
  title: string;
  categoryId: string | null;
}) {
  const isAdmin = useAdminSession();
  const utils = trpc.useUtils();
  const categories = trpc.library.categories.useQuery(undefined, { enabled: isAdmin });
  const [open, setOpen] = useState(false);
  const [changingCategory, setChangingCategory] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const updateFile = trpc.admin.updateFile.useMutation({
    onSuccess: async () => {
      await utils.library.files.invalidate();
      await utils.library.dashboard.invalidate();
      setChangingCategory(false);
      setEditingTitle(false);
      setOpen(false);
    },
    onError: (err) => alert(explainAdminError(err)),
  });
  const deleteFile = trpc.admin.deleteFile.useMutation({
    onSuccess: async () => {
      await utils.library.files.invalidate();
      await utils.library.dashboard.invalidate();
      await utils.library.categories.invalidate();
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
    setChangingCategory(false);
    setEditingTitle(false);
  }

  function saveTitle() {
    const next = titleDraft.trim();
    if (!next || next === title) {
      setEditingTitle(false);
      setTitleDraft(title);
      return;
    }
    updateFile.mutate({ id: fileId, title: next });
  }

  return (
    <div className="relative shrink-0" onClick={stop}>
      <button
        type="button"
        onClick={(e) => {
          stop(e);
          setOpen((v) => !v);
        }}
        aria-label="ตั้งค่าไฟล์นี้"
        className="text-navy-700/40 hover:text-navy-900 w-7 h-7 flex items-center justify-center rounded-md hover:bg-navy-900/5 transition-colors leading-none"
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[5]" onClick={closeAll} />
          <div
            className="absolute right-0 top-8 z-10 w-52 bg-white rounded-xl border border-navy-900/10 shadow-card-hover py-1.5 text-sm overflow-hidden"
            onClick={stop}
          >
            {!changingCategory && !editingTitle && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setTitleDraft(title);
                    setEditingTitle(true);
                  }}
                  className="w-full text-left px-3.5 py-2 text-navy-800 hover:bg-navy-900/5 transition-colors"
                >
                  แก้ไขชื่อเรื่อง
                </button>
                <button
                  type="button"
                  onClick={() => setChangingCategory(true)}
                  className="w-full text-left px-3.5 py-2 text-navy-800 hover:bg-navy-900/5 transition-colors"
                >
                  ย้ายหมวดหมู่
                </button>
                <div className="h-px bg-navy-900/10 mx-1" />
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="w-full text-left px-3.5 py-2 text-red-700 hover:bg-red-50 transition-colors inline-flex items-center gap-2"
                >
                  <IconTrash width={14} height={14} /> ลบไฟล์
                </button>
              </>
            )}
            {editingTitle && (
              <div className="px-3.5 py-2">
                <label className="text-xs font-medium text-navy-700/60 block mb-1.5">ชื่อเรื่อง</label>
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveTitle();
                    if (e.key === "Escape") {
                      setTitleDraft(title);
                      setEditingTitle(false);
                    }
                  }}
                  className="w-full rounded-lg border border-navy-900/15 px-2 py-1.5 text-sm bg-white"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={saveTitle}
                    disabled={updateFile.isLoading || !titleDraft.trim()}
                    className="flex-1 rounded-lg bg-navy-950 text-ivory text-xs font-medium py-1.5 disabled:opacity-40"
                  >
                    {updateFile.isLoading ? "กำลังบันทึก..." : "บันทึก"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTitleDraft(title);
                      setEditingTitle(false);
                    }}
                    className="rounded-lg border border-navy-900/15 text-xs font-medium px-3 py-1.5"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}
            {changingCategory && (
              <div className="px-3.5 py-2">
                <label className="text-xs font-medium text-navy-700/60 block mb-1.5">ย้ายไปหมวดหมู่</label>
                <select
                  autoFocus
                  defaultValue={categoryId ?? ""}
                  onChange={(e) => updateFile.mutate({ id: fileId, categoryId: e.target.value })}
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
        onConfirm={() => deleteFile.mutate({ id: fileId })}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
