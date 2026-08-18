import { useState } from "react";
import AdminGate from "../../components/AdminGate";
import { trpc } from "../../lib/trpc";
import { IconCategory, IconTrash } from "../../components/icons";
import { explainAdminError } from "../../lib/explainAdminError";
import ConfirmDialog from "../../components/ConfirmDialog";
import { slugify } from "../../lib/slugify";

function AdminCategoriesInner() {
  const utils = trpc.useUtils();
  const categories = trpc.library.categories.useQuery();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const create = trpc.admin.createCategory.useMutation({
    onSuccess: async () => {
      setName("");
      setDescription("");
      await utils.library.categories.invalidate();
      await utils.library.dashboard.invalidate();
    },
    onError: (err) => {
      if (err.message !== "CATEGORY_SLUG_EXISTS") alert(explainAdminError(err));
    },
  });

  const deleteCategory = trpc.admin.deleteCategory.useMutation({
    onSuccess: async () => {
      await utils.library.categories.invalidate();
      await utils.library.dashboard.invalidate();
      setConfirmingDeleteId(null);
    },
    onError: (err) => {
      setConfirmingDeleteId(null);
      alert(explainAdminError(err));
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({ name, slug: slugify(name), description: description || undefined });
  }

  const confirmingCategory = categories.data?.find((c) => c.id === confirmingDeleteId);

  return (
    <div className="space-y-8">
      <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-navy-900">จัดการหมวดหมู่</h1>

      <form onSubmit={onSubmit} className="card p-5 space-y-4 max-w-md">
        <div>
          <label htmlFor="cat-name" className="label-field">
            ชื่อหมวดหมู่
          </label>
          <input id="cat-name" required value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
        </div>
        <div>
          <label htmlFor="cat-desc" className="label-field">
            คำอธิบาย (ไม่บังคับ)
          </label>
          <input id="cat-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="input-field" />
        </div>
        {create.isError && <div className="text-red-700 text-sm">ชื่อหรือ slug นี้มีอยู่แล้ว ลองใช้ชื่ออื่น</div>}
        <button type="submit" disabled={create.isLoading || !name.trim()} className="btn-primary">
          {create.isLoading ? "กำลังบันทึก..." : "เพิ่มหมวดหมู่"}
        </button>
      </form>

      <div>
        <h2 className="font-serif text-lg font-semibold text-navy-900 mb-3">หมวดหมู่ทั้งหมด</h2>
        {categories.data && categories.data.length === 0 && <p className="text-navy-700/60">ยังไม่มีหมวดหมู่</p>}
        <ul className="space-y-2">
          {categories.data?.map((cat) => (
            <li key={cat.id} className="card px-4 py-3 flex items-center gap-2.5">
              <IconCategory width={17} height={17} className="text-gold-600 shrink-0" />
              <span className="font-medium text-navy-900">{cat.name}</span>
              <span className="text-navy-700/50 text-sm">/{cat.slug}</span>
              <button
                type="button"
                onClick={() => setConfirmingDeleteId(cat.id)}
                className="ml-auto text-navy-700/40 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                aria-label={`ลบหมวดหมู่ ${cat.name}`}
              >
                <IconTrash width={15} height={15} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={!!confirmingDeleteId}
        title="ลบหมวดหมู่นี้ถาวร?"
        message={`"${confirmingCategory?.name ?? ""}" จะถูกลบและกู้คืนไม่ได้ (ลบไม่ได้หากยังมีไฟล์อยู่ในหมวดนี้)`}
        isBusy={deleteCategory.isLoading}
        onConfirm={() => confirmingDeleteId && deleteCategory.mutate({ id: confirmingDeleteId })}
        onCancel={() => setConfirmingDeleteId(null)}
      />
    </div>
  );
}

export default function AdminCategories() {
  return (
    <AdminGate>
      <AdminCategoriesInner />
    </AdminGate>
  );
}
