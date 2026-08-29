import { useState } from "react";
import RichTextEditor from "../components/RichTextEditor";
import NoteHeader from "../components/NoteHeader";
import FontManagerDialog from "../components/FontManagerDialog";

/**
 * The writing surface on its own, with sample content and no account behind
 * it — a place to try every tool without logging in or touching a real note.
 *
 * The header and the editor here are the same components the notebook itself
 * renders (NoteHeader, RichTextEditor); only the state behind them is local,
 * so "save" just marks the page clean instead of writing to the database.
 * Registered only while the dev server is running (see App.tsx), so it never
 * exists in a build that ships.
 */

const SAMPLE = `<h1>โหราศาสตร์ไทย</h1>
<p><span style="color:#b8893a">สรุปสิ่งที่ทำได้</span> — <strong>ผูกดวงจากวันเดือนปีเกิด</strong> อ่านเรือนชะตา และ <em>อธิบายให้คนฟังเข้าใจได้</em></p>
<h2>สิ่งที่กำลังฝึกอยู่</h2>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="true"><p>อ่านเรือนที่ 1-6 ได้คล่อง</p></li>
<li data-type="taskItem" data-checked="false"><p>คำนวณทักษาโดยไม่ใช้ตาราง</p></li>
</ul>
<h2>ธาตุประจำดาว</h2>
<table><tbody>
<tr><th><p>ดาว</p></th><th><p>ธาตุ</p></th></tr>
<tr><td><p>อาทิตย์</p></td><td><p>ไฟ</p></td></tr>
<tr><td><p>จันทร์</p></td><td><p>น้ำ</p></td></tr>
</tbody></table>
<blockquote><p>ดวงบอกแนวโน้ม ไม่ได้บอกคำตัดสิน</p></blockquote>
<p>อ้างอิง: <mark data-color="#fde68a">ตำราเรียนเล่มที่ 2 หน้า 45</mark></p>`;

export default function EditorPlayground() {
  const [html, setHtml] = useState(SAMPLE);
  const [title, setTitle] = useState("โหราศาสตร์ไทย");
  const [icon, setIcon] = useState<string | null>("🔮");
  const [tags, setTags] = useState(["สกิล", "โหราศาสตร์"]);
  const [isPinned, setIsPinned] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [fontsOpen, setFontsOpen] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-sm text-navy-700/60">
        หน้าทดลอง — เครื่องมือทุกอย่างใช้ได้จริง แต่ยังไม่ได้ล็อกอิน จึงไม่มีการบันทึกลงฐานข้อมูล
      </p>

      <div className="card p-4 sm:p-6">
        <NoteHeader
          title={title}
          icon={icon}
          tags={tags}
          isPinned={isPinned}
          dirty={dirty}
          saving={false}
          savedAt={savedAt}
          onTitleChange={(next) => {
            setTitle(next);
            setDirty(true);
          }}
          onIconChange={(next) => {
            setIcon(next);
            setDirty(true);
          }}
          onTagsChange={(next) => {
            setTags(next);
            setDirty(true);
          }}
          onTogglePin={() => {
            setIsPinned((v) => !v);
            setDirty(true);
          }}
          onSave={() => {
            setSavedAt(new Date());
            setDirty(false);
          }}
          onDelete={() => undefined}
        />
        <RichTextEditor
          value={html}
          onChange={(next) => {
            setHtml(next);
            setDirty(true);
          }}
          fontFamilies={["ฟอนต์ที่อัปโหลดเอง"]}
          onManageFonts={() => setFontsOpen(true)}
        />
      </div>

      {fontsOpen && <FontManagerDialog onClose={() => setFontsOpen(false)} />}
    </div>
  );
}
