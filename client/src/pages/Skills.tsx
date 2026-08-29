import { useState } from "react";
import { Link } from "react-router-dom";
import AdminGate from "../components/AdminGate";
import ConfirmDialog from "../components/ConfirmDialog";
import KnowledgeChatPanel from "../components/KnowledgeChatPanel";
import { trpc } from "../lib/trpc";
import { IconEdit, IconPlus, IconStar, IconTrash } from "../components/icons";

/**
 * สกิลของฉัน — the structured half of the notebook.
 *
 * A skill is a row (name, area, level, years) plus a page. The row is what
 * makes a list of forty skills readable and sortable; the page is where the
 * actual knowledge goes, and it is an ordinary note with the ordinary editor,
 * tagged so it shows up in the notebook too. Both halves are in the AI's
 * context when a question is asked, which is the whole point of keeping them
 * in one place.
 */

/** Mirrors SKILL_TAG in server/src/routers/skills.ts — the tag every skill page carries. */
const SKILL_TAG = "สกิล";

const LEVEL_LABELS = ["เริ่มต้น", "พอใช้", "ปานกลาง", "ชำนาญ", "เชี่ยวชาญ"];

function LevelStars({ level, onPick }: { level: number; onPick?: (level: number) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`ระดับ ${level}/5 — ${LEVEL_LABELS[level - 1]}`}>
      {[1, 2, 3, 4, 5].map((step) => (
        <button
          key={step}
          type="button"
          disabled={!onPick}
          onClick={() => onPick?.(step)}
          aria-label={`ตั้งระดับเป็น ${step} (${LEVEL_LABELS[step - 1]})`}
          className={`p-0.5 rounded ${onPick ? "hover:scale-110 transition-transform" : "cursor-default"}`}
        >
          <IconStar
            width={16}
            height={16}
            className={step <= level ? "text-gold-500" : "text-navy-900/15"}
            fill={step <= level ? "currentColor" : "none"}
          />
        </button>
      ))}
    </span>
  );
}

function AddSkillForm({ onDone }: { onDone: () => void }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState(3);
  const [experience, setExperience] = useState("");
  const [summary, setSummary] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const subjects = trpc.subjects.list.useQuery();

  const create = trpc.skills.create.useMutation({
    onSuccess: async () => {
      await utils.skills.list.invalidate();
      await utils.notes.list.invalidate();
      await utils.notes.tags.invalidate();
      onDone();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({
          name: name.trim(),
          subjectId: subjectId || null,
          category: category.trim() || undefined,
          level,
          experience: experience.trim() || undefined,
          summary: summary.trim() || undefined,
        });
      }}
      className="card p-5 space-y-4"
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label-field" htmlFor="skill-name">
            ชื่อสกิล
          </label>
          <input id="skill-name" required value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="label-field" htmlFor="skill-subject">
            หมวดใหญ่
          </label>
          <select id="skill-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="input-field">
            <option value="">ยังไม่จัดหมวด</option>
            {subjects.data?.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.icon ? `${subject.icon} ` : ""}
                {subject.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-field" htmlFor="skill-category">
            วิชา / กลุ่มย่อย (ไม่บังคับ)
          </label>
          <input
            id="skill-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="เช่น โหราศาสตร์, การสอน, เทคโนโลยี"
            className="input-field"
          />
        </div>
        <div>
          <label className="label-field" htmlFor="skill-experience">
            ประสบการณ์ (ไม่บังคับ)
          </label>
          <input
            id="skill-experience"
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            placeholder="เช่น 5 ปี หรือ ตั้งแต่ปี 2560"
            className="input-field"
          />
        </div>
        <div>
          <span className="label-field">ระดับความชำนาญ</span>
          <div className="flex items-center gap-3 pt-1.5">
            <LevelStars level={level} onPick={setLevel} />
            <span className="text-sm text-navy-700/70">{LEVEL_LABELS[level - 1]}</span>
          </div>
        </div>
      </div>
      <div>
        <label className="label-field" htmlFor="skill-summary">
          สรุปสั้นๆ (ไม่บังคับ)
        </label>
        <input
          id="skill-summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="ทำอะไรได้บ้างในหนึ่งบรรทัด"
          className="input-field"
        />
      </div>

      {create.error && (
        <p className="text-red-700 text-sm">
          {create.error.message === "SKILL_NAME_TAKEN" ? "มีสกิลชื่อนี้อยู่แล้ว" : "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={create.isLoading || !name.trim()} className="btn-gold text-sm py-2 px-4">
          {create.isLoading ? "กำลังบันทึก…" : "เพิ่มสกิล + สร้างหน้าโน้ตให้"}
        </button>
        <button type="button" onClick={onDone} className="btn-outline text-sm py-2 px-4">
          ยกเลิก
        </button>
      </div>
    </form>
  );
}

type SkillRow = {
  id: string;
  name: string;
  category: string | null;
  level: number;
  summary: string | null;
  experience: string | null;
  noteId: string | null;
};

function SkillCard({ skill }: { skill: SkillRow }) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    name: skill.name,
    category: skill.category ?? "",
    experience: skill.experience ?? "",
    summary: skill.summary ?? "",
  });

  const update = trpc.skills.update.useMutation({
    onSuccess: async () => {
      await utils.skills.list.invalidate();
      await utils.notes.list.invalidate();
      setEditing(false);
    },
  });

  const remove = trpc.skills.remove.useMutation({
    onSuccess: async () => {
      await utils.skills.list.invalidate();
      setConfirmDelete(false);
    },
  });

  return (
    <li className="card p-4">
      {editing ? (
        <div className="space-y-3">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            aria-label="ชื่อสกิล"
            className="input-field"
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="หมวด"
              aria-label="หมวด"
              className="input-field"
            />
            <input
              value={form.experience}
              onChange={(e) => setForm({ ...form, experience: e.target.value })}
              placeholder="ประสบการณ์"
              aria-label="ประสบการณ์"
              className="input-field"
            />
          </div>
          <input
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
            placeholder="สรุปสั้นๆ"
            aria-label="สรุปสั้นๆ"
            className="input-field"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={update.isLoading || !form.name.trim()}
              onClick={() =>
                update.mutate({
                  id: skill.id,
                  name: form.name.trim(),
                  category: form.category.trim() || null,
                  experience: form.experience.trim() || null,
                  summary: form.summary.trim() || null,
                })
              }
              className="btn-primary text-sm py-2 px-4"
            >
              {update.isLoading ? "กำลังบันทึก…" : "บันทึก"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn-outline text-sm py-2 px-4">
              ยกเลิก
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <h3 className="font-serif text-lg font-semibold text-navy-900 flex-1 min-w-0">{skill.name}</h3>
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`แก้ไข ${skill.name}`}
              className="p-1.5 rounded-lg text-navy-700/40 hover:text-gold-600 hover:bg-gold-400/10"
            >
              <IconEdit width={15} height={15} />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label={`ลบ ${skill.name}`}
              className="p-1.5 rounded-lg text-navy-700/40 hover:text-red-700 hover:bg-red-50"
            >
              <IconTrash width={15} height={15} />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <LevelStars level={skill.level} onPick={(level) => update.mutate({ id: skill.id, level })} />
            <span className="text-sm text-navy-700/70">{LEVEL_LABELS[skill.level - 1]}</span>
            {skill.experience && <span className="text-sm text-navy-700/60">· {skill.experience}</span>}
          </div>

          {skill.summary && <p className="text-sm text-navy-800">{skill.summary}</p>}

          {skill.noteId && (
            <Link to={`/notes?id=${skill.noteId}`} className="inline-block text-sm text-gold-600 hover:text-gold-500 font-medium">
              เปิดหน้าโน้ตของสกิลนี้ →
            </Link>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="ลบสกิลนี้?"
        message={`"${skill.name}" จะหายจากรายการสกิล (หน้าโน้ตของมันยังอยู่ในโน้ตของคุณ)`}
        isBusy={remove.isLoading}
        onConfirm={() => remove.mutate({ id: skill.id })}
        onCancel={() => setConfirmDelete(false)}
      />
    </li>
  );
}

function SkillsInner() {
  const [adding, setAdding] = useState(false);
  const skills = trpc.skills.list.useQuery();

  const groups = new Map<string, SkillRow[]>();
  for (const skill of skills.data ?? []) {
    const key = skill.category ?? "อื่นๆ";
    groups.set(key, [...(groups.get(key) ?? []), skill]);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-navy-900">สกิลของฉัน</h1>
          <p className="text-sm text-navy-700/70">แต่ละสกิลมีหน้าโน้ตของตัวเอง เขียนรายละเอียดได้เต็มที่ แล้ว AI จะอ่านทั้งหมด</p>
        </div>
        <div className="flex gap-2">
          <Link to="/notes" className="btn-outline text-sm py-2 px-3">
            โน้ตทั้งหมด
          </Link>
          {!adding && (
            <button type="button" onClick={() => setAdding(true)} className="btn-gold text-sm py-2 px-3 inline-flex items-center gap-1.5">
              <IconPlus width={15} height={15} /> เพิ่มสกิล
            </button>
          )}
        </div>
      </div>

      {adding && <AddSkillForm onDone={() => setAdding(false)} />}

      {skills.isLoading && <p className="text-navy-700/60">กำลังโหลด…</p>}
      {skills.data?.length === 0 && !adding && (
        <div className="card p-10 text-center text-navy-700/60">ยังไม่มีสกิล — กด “เพิ่มสกิล” เพื่อเริ่มบันทึก</div>
      )}

      <div className="space-y-6">
        {[...groups.entries()].map(([category, rows]) => (
          <section key={category}>
            <h2 className="text-sm font-semibold text-navy-700/60 uppercase tracking-wide mb-2">{category}</h2>
            <ul className="grid sm:grid-cols-2 gap-3">
              {rows.map((skill) => (
                <SkillCard key={skill.id} skill={skill} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <KnowledgeChatPanel tag={SKILL_TAG} />
    </div>
  );
}

export default function Skills() {
  return (
    <AdminGate>
      <SkillsInner />
    </AdminGate>
  );
}
