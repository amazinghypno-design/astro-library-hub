import { useState } from "react";
import { Link } from "react-router-dom";
import AdminGate from "../../components/AdminGate";
import ConfirmDialog from "../../components/ConfirmDialog";
import { trpc } from "../../lib/trpc";
import { slugify } from "../../lib/slugify";
import { explainAdminError } from "../../lib/explainAdminError";
import { IconCategory, IconEdit, IconPlus, IconTrash } from "../../components/icons";

/**
 * Where the vault's shape is edited: the หมวดใหญ่ themselves, and the วิชา
 * inside each one.
 *
 * Both live on one page because they are one decision — "what is kept here,
 * and how is it divided" — and splitting them across two screens is what
 * makes people file things in the wrong place. Each subject is a card holding
 * its own วิชา, so adding one is done *inside* the subject it belongs to
 * rather than by picking a parent from a dropdown afterwards.
 */

const EMOJI_CHOICES = ["🔮", "🧠", "📜", "⭐", "🌙", "🪄", "🧭", "💠", "🕉️", "🌿", "💰", "❤️", "🎯", "📿"];

function SubjectRow({ subject }: { subject: { id: string; slug: string; name: string; description: string | null; icon: string | null; fileCount: number; categoryCount: number; noteCount: number } }) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(subject.name);
  const [description, setDescription] = useState(subject.description ?? "");
  const [icon, setIcon] = useState(subject.icon ?? "");
  const [newCategory, setNewCategory] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const categories = trpc.library.categories.useQuery({ subject: subject.slug });
  const allSubjects = trpc.subjects.list.useQuery();

  async function refresh() {
    await utils.subjects.list.invalidate();
    await utils.subjects.bySlug.invalidate();
    await utils.library.categories.invalidate();
    await utils.library.dashboard.invalidate();
  }

  const update = trpc.subjects.update.useMutation({
    onSuccess: async () => {
      await refresh();
      setEditing(false);
    },
    onError: (err) => alert(explainAdminError(err)),
  });

  const removeSubject = trpc.subjects.remove.useMutation({
    onSuccess: async () => {
      await refresh();
      setConfirmDelete(false);
    },
    onError: (err) => {
      setConfirmDelete(false);
      alert(err.message === "SUBJECT_NOT_EMPTY" ? "ลบไม่ได้ — ยังมีวิชา ไฟล์ หรือโน้ตอยู่ในหมวดนี้" : explainAdminError(err));
    },
  });

  const createCategory = trpc.admin.createCategory.useMutation({
    onSuccess: async () => {
      setNewCategory("");
      await refresh();
    },
    onError: (err) => alert(err.message === "CATEGORY_SLUG_EXISTS" ? "มีวิชาชื่อนี้อยู่แล้ว" : explainAdminError(err)),
  });

  const deleteCategory = trpc.admin.deleteCategory.useMutation({
    onSuccess: refresh,
    onError: (err) => alert(explainAdminError(err)),
  });

  const moveCategory = trpc.subjects.moveCategory.useMutation({
    onSuccess: refresh,
    onError: (err) => alert(explainAdminError(err)),
  });

  return (
    <li className="card p-5">
      {editing ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {EMOJI_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => setIcon(choice)}
                aria-label={`ใช้ไอคอน ${choice}`}
                className={`w-9 h-9 rounded-xl text-lg grid place-items-center border transition-colors ${
                  icon === choice ? "border-gold-500 bg-gold-400/15" : "border-navy-900/10 hover:border-gold-500/50"
                }`}
              >
                {choice}
              </button>
            ))}
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="ชื่อหมวดใหญ่" className="input-field" />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="คำอธิบายสั้นๆ"
            aria-label="คำอธิบายหมวดใหญ่"
            className="input-field"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={update.isLoading || !name.trim()}
              onClick={() =>
                update.mutate({
                  id: subject.id,
                  name: name.trim(),
                  description: description.trim() || null,
                  icon: icon || null,
                })
              }
              className="btn-primary text-sm py-2 px-4"
            >
              {update.isLoading ? "กำลังบันทึก…" : "บันทึกชื่อหมวด"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn-outline text-sm py-2 px-4">
              ยกเลิก
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <span aria-hidden className="shrink-0 w-11 h-11 rounded-2xl bg-gold-400/15 border border-gold-500/25 grid place-items-center text-xl">
            {subject.icon ?? "✦"}
          </span>
          <div className="min-w-0 flex-1">
            <Link to={`/subject/${subject.slug}`} className="font-serif text-lg font-semibold text-navy-900 hover:text-gold-600">
              {subject.name}
            </Link>
            {subject.description && <p className="text-sm text-navy-700/70">{subject.description}</p>}
            <p className="text-xs text-navy-700/50 mt-1">
              {subject.categoryCount} วิชา · {subject.fileCount} ไฟล์ · {subject.noteCount} โน้ต · /{subject.slug}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`แก้ไข ${subject.name}`}
            className="p-2 rounded-lg text-navy-700/40 hover:text-gold-600 hover:bg-gold-400/10"
          >
            <IconEdit width={16} height={16} />
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label={`ลบ ${subject.name}`}
            className="p-2 rounded-lg text-navy-700/40 hover:text-red-700 hover:bg-red-50"
          >
            <IconTrash width={16} height={16} />
          </button>
        </div>
      )}

      <div className="mt-4 pl-1 border-t border-navy-900/[0.07] pt-3">
        <p className="text-xs uppercase tracking-wide text-navy-700/45 mb-2">วิชาในหมวดนี้</p>
        {categories.data?.length === 0 && <p className="text-sm text-navy-700/55 mb-2">ยังไม่มีวิชา — เพิ่มด้านล่างได้เลย</p>}
        <ul className="space-y-1.5 mb-3">
          {categories.data?.map((category) => (
            <li key={category.id} className="flex flex-wrap items-center gap-2 text-sm">
              <IconCategory width={15} height={15} className="text-gold-600 shrink-0" />
              <span className="font-medium text-navy-900">{category.name}</span>
              {/* Moving a วิชา takes its files with it — see subjects.moveCategory. */}
              <select
                value={subject.id}
                onChange={(e) => moveCategory.mutate({ categoryId: category.id, subjectId: e.target.value })}
                aria-label={`ย้าย ${category.name} ไปหมวดใหญ่อื่น`}
                className="ml-auto text-xs px-2 py-1 rounded-lg border border-navy-900/15 bg-white text-navy-700"
              >
                {allSubjects.data?.map((option) => (
                  <option key={option.id} value={option.id}>
                    ย้ายไป: {option.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => deleteCategory.mutate({ id: category.id })}
                aria-label={`ลบวิชา ${category.name}`}
                className="p-1.5 rounded-lg text-navy-700/35 hover:text-red-700 hover:bg-red-50"
              >
                <IconTrash width={14} height={14} />
              </button>
            </li>
          ))}
        </ul>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const name = newCategory.trim();
            if (!name) return;
            createCategory.mutate({ name, slug: slugify(name), subjectId: subject.id });
          }}
          className="flex gap-2"
        >
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder={`เพิ่มวิชาใน ${subject.name}…`}
            aria-label={`ชื่อวิชาใหม่ใน ${subject.name}`}
            className="input-field py-2 text-sm"
          />
          <button type="submit" disabled={createCategory.isLoading || !newCategory.trim()} className="btn-outline text-sm py-2 px-3 shrink-0 inline-flex items-center gap-1.5">
            <IconPlus width={14} height={14} /> เพิ่มวิชา
          </button>
        </form>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="ลบหมวดใหญ่นี้?"
        message={`"${subject.name}" จะถูกลบถาวร (ลบได้เฉพาะหมวดที่ยังว่าง — ไม่มีวิชา ไฟล์ หรือโน้ตอยู่)`}
        isBusy={removeSubject.isLoading}
        onConfirm={() => removeSubject.mutate({ id: subject.id })}
        onCancel={() => setConfirmDelete(false)}
      />
    </li>
  );
}

function NewSubjectForm() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [icon, setIcon] = useState("✦");
  const [description, setDescription] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const create = trpc.subjects.create.useMutation({
    onSuccess: async () => {
      await utils.subjects.list.invalidate();
      setName("");
      setSlug("");
      setDescription("");
      setSlugTouched(false);
      setOpen(false);
    },
    onError: (err) =>
      alert(err.message === "SUBJECT_EXISTS" ? "มีหมวดใหญ่ชื่อนี้หรือลิงก์นี้อยู่แล้ว" : explainAdminError(err)),
  });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-gold text-sm py-2.5 px-4 inline-flex items-center gap-1.5">
        <IconPlus width={16} height={16} /> เพิ่มหมวดใหญ่
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({
          name: name.trim(),
          slug: (slug || slugify(name)).trim(),
          icon: icon || undefined,
          description: description.trim() || undefined,
        });
      }}
      className="card p-5 space-y-3 w-full"
    >
      <h2 className="font-serif text-lg font-semibold text-navy-900">หมวดใหญ่ใหม่</h2>
      <div className="flex flex-wrap gap-1.5">
        {EMOJI_CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => setIcon(choice)}
            aria-label={`ใช้ไอคอน ${choice}`}
            className={`w-9 h-9 rounded-xl text-lg grid place-items-center border transition-colors ${
              icon === choice ? "border-gold-500 bg-gold-400/15" : "border-navy-900/10 hover:border-gold-500/50"
            }`}
          >
            {choice}
          </button>
        ))}
      </div>
      <div>
        <label className="label-field" htmlFor="subject-name">
          ชื่อหมวดใหญ่
        </label>
        <input
          id="subject-name"
          required
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          placeholder="เช่น สั่งจิตใต้สำนึก, สมุนไพร, การลงทุน"
          className="input-field"
        />
      </div>
      <div>
        <label className="label-field" htmlFor="subject-slug">
          ชื่อลิงก์ (แก้ได้ — ใช้ในที่อยู่เว็บและตอนให้ AI ดึงข้อมูล)
        </label>
        <input
          id="subject-slug"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
          placeholder="subconscious"
          className="input-field font-mono text-sm"
        />
      </div>
      <div>
        <label className="label-field" htmlFor="subject-desc">
          คำอธิบาย (ไม่บังคับ)
        </label>
        <input
          id="subject-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input-field"
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={create.isLoading || !name.trim()} className="btn-gold text-sm py-2 px-4">
          {create.isLoading ? "กำลังสร้าง…" : "สร้างหมวดใหญ่"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-outline text-sm py-2 px-4">
          ยกเลิก
        </button>
      </div>
    </form>
  );
}

function AdminSubjectsInner() {
  const subjects = trpc.subjects.list.useQuery();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-navy-900">หมวดใหญ่และวิชา</h1>
          <p className="text-sm text-navy-700/70 mt-1">
            หมวดใหญ่คือหนึ่งศาสตร์ ข้างในมีวิชาของตัวเอง — เพิ่ม แก้ชื่อ ย้าย และลบได้จากหน้านี้
          </p>
        </div>
        <NewSubjectForm />
      </div>

      {subjects.isLoading && <p className="text-navy-700/60">กำลังโหลด…</p>}
      <ul className="space-y-4">
        {subjects.data?.map((subject) => (
          <SubjectRow key={subject.id} subject={subject} />
        ))}
      </ul>
    </div>
  );
}

export default function AdminSubjects() {
  return (
    <AdminGate>
      <AdminSubjectsInner />
    </AdminGate>
  );
}
