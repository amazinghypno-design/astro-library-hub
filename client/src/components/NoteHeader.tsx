import { useState } from "react";
import { IconBookmark, IconSave, IconTrash } from "./icons";

/**
 * The top of a page: its icon, its name, its tags, and whether it is saved.
 *
 * Presentational on purpose — it holds no draft, no mutation and no query, so
 * the notebook can render it against a real note and the dev playground can
 * render it against local state, and what is seen in one is genuinely the
 * same component as the other.
 *
 * The save state is spelled out rather than implied by a spinner: "ยังไม่ได้
 * บันทึก" in gold while there is unsaved work, the time of the last save once
 * there isn't. A notebook that only *implies* it saved is one people keep
 * re-checking.
 */

export interface SubjectOption {
  id: string;
  name: string;
  icon: string | null;
}

export interface NoteHeaderProps {
  title: string;
  icon: string | null;
  tags: string[];
  isPinned: boolean;
  /** Unsaved changes — drives both the status colour and whether บันทึก can be pressed. */
  dirty: boolean;
  saving: boolean;
  /** null until this page has been saved at least once in this session. */
  savedAt: Date | null;
  onTitleChange: (title: string) => void;
  onIconChange: (icon: string | null) => void;
  onTagsChange: (tags: string[]) => void;
  onTogglePin: () => void;
  onSave: () => void;
  onDelete: () => void;
  /** หมวดใหญ่ the page is filed under, and the ones it could be moved to. */
  subjects?: SubjectOption[];
  subjectId?: string | null;
  onSubjectChange?: (subjectId: string | null) => void;
}

export function saveStateLabel(dirty: boolean, saving: boolean, savedAt: Date | null): string {
  if (saving) return "กำลังบันทึก…";
  if (dirty) return "ยังไม่ได้บันทึก";
  if (savedAt) return `บันทึกแล้ว ${savedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;
  return "บันทึกแล้ว";
}

export default function NoteHeader({
  title,
  icon,
  tags,
  isPinned,
  dirty,
  saving,
  savedAt,
  onTitleChange,
  onIconChange,
  onTagsChange,
  onTogglePin,
  onSave,
  onDelete,
  subjects = [],
  subjectId = null,
  onSubjectChange,
}: NoteHeaderProps) {
  const [tagInput, setTagInput] = useState("");

  function commitTag() {
    const tag = tagInput.trim();
    if (!tag || tags.includes(tag)) {
      setTagInput("");
      return;
    }
    onTagsChange([...tags, tag]);
    setTagInput("");
  }

  return (
    <>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => {
            const next = window.prompt("ใส่อีโมจิสำหรับหน้านี้ (เว้นว่างเพื่อเอาออก)", icon ?? "");
            if (next === null) return;
            onIconChange(next.trim() ? Array.from(next.trim())[0] : null);
          }}
          title="เปลี่ยนไอคอนหน้า"
          className="text-2xl leading-none w-10 h-10 rounded-xl hover:bg-navy-900/[0.05] shrink-0"
        >
          {icon ?? "📄"}
        </button>
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="ตั้งชื่องานที่นี่"
          aria-label="ชื่องาน"
          className="flex-1 min-w-0 font-serif text-2xl sm:text-3xl font-semibold text-navy-900 bg-transparent border-none focus:outline-none placeholder:text-navy-700/25"
        />
        <button
          type="button"
          onClick={onTogglePin}
          title={isPinned ? "เอาออกจากรายการปักหมุด" : "ปักหมุดไว้บนสุด"}
          className={`p-2 rounded-lg transition-colors ${
            isPinned ? "text-gold-600 bg-gold-400/15" : "text-navy-700/40 hover:bg-navy-900/[0.05]"
          }`}
        >
          <IconBookmark width={17} height={17} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="ลบหน้านี้"
          className="p-2 rounded-lg text-navy-700/40 hover:text-red-700 hover:bg-red-50 transition-colors"
        >
          <IconTrash width={17} height={17} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-3 mb-1">
        {subjects.length > 0 && onSubjectChange && (
          <select
            value={subjectId ?? ""}
            onChange={(e) => onSubjectChange(e.target.value || null)}
            aria-label="หมวดใหญ่ของหน้านี้"
            title="หมวดใหญ่ของหน้านี้"
            className="text-xs px-2 py-1 rounded-lg border border-navy-900/15 bg-white text-navy-800 focus:outline-none focus:border-gold-500"
          >
            <option value="">ยังไม่จัดหมวด</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.icon ? `${subject.icon} ` : ""}
                {subject.name}
              </option>
            ))}
          </select>
        )}
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-navy-900/[0.05] text-xs text-navy-800">
            {tag}
            <button
              type="button"
              onClick={() => onTagsChange(tags.filter((t) => t !== tag))}
              aria-label={`เอาแท็ก ${tag} ออก`}
              className="text-navy-700/40 hover:text-red-700"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTag();
            }
          }}
          onBlur={commitTag}
          placeholder="+ แท็ก"
          aria-label="เพิ่มแท็ก"
          className="text-xs px-2 py-1 w-24 rounded-lg border border-dashed border-navy-900/20 bg-transparent focus:outline-none focus:border-gold-500"
        />
        <span className="ml-auto flex items-center gap-2.5">
          <span className={`text-xs ${dirty ? "text-gold-600 font-medium" : "text-navy-700/45"}`}>
            {saveStateLabel(dirty, saving, savedAt)}
          </span>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !dirty}
            title="บันทึกงาน (Ctrl+S)"
            className="btn-gold text-sm py-1.5 px-3.5 inline-flex items-center gap-1.5"
          >
            <IconSave width={15} height={15} /> บันทึก
          </button>
        </span>
      </div>
    </>
  );
}
