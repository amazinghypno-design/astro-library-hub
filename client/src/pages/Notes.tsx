import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AdminGate from "../components/AdminGate";
import RichTextEditor from "../components/RichTextEditor";
import KnowledgeChatPanel from "../components/KnowledgeChatPanel";
import ConfirmDialog from "../components/ConfirmDialog";
import NoteHeader from "../components/NoteHeader";
import { trpc } from "../lib/trpc";
import FontManagerDialog from "../components/FontManagerDialog";
import { useNoteFonts } from "../lib/useNoteFonts";
import { IconBookmark, IconDocument, IconFontFile, IconPlus, IconSearch, IconUpload } from "../components/icons";

/**
 * The notebook: a list of pages on the left, the page being written on the
 * right, and an AI that can read all of them underneath.
 *
 * Which page is open lives in the URL (`/notes?id=…`) rather than in state,
 * so a page can be linked to — which is what makes a skill's "เปิดโน้ต" button
 * work, and what makes the browser's back button do the obvious thing.
 *
 * Saving works two ways on purpose. There is a real บันทึก button (and
 * Ctrl/Cmd+S), because "did that actually save?" is a question the owner
 * should never have to ask about work they just finished — and behind it an
 * autosave on a short debounce, because a notebook that can lose a paragraph
 * to a closed tab is not one anybody will trust with the writing they are
 * moving out of Notion. The button is the promise; the autosave is the net.
 */

const AUTOSAVE_DELAY_MS = 1500;

interface Draft {
  title: string;
  icon: string | null;
  contentHtml: string;
  tags: string[];
  isPinned: boolean;
  subjectId: string | null;
}

function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (id: string) => void }) {
  const [markdown, setMarkdown] = useState("");
  const [title, setTitle] = useState("");
  const utils = trpc.useUtils();

  const importMarkdown = trpc.notes.importMarkdown.useMutation({
    onSuccess: async (created) => {
      await utils.notes.list.invalidate();
      onImported(created.id);
      onClose();
    },
  });

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setMarkdown(await file.text());
    if (!title) setTitle(file.name.replace(/\.(md|markdown|txt)$/i, "").replace(/\s+[0-9a-f]{6,}$/i, ""));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-950/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-card-hover p-5 w-full max-w-2xl space-y-4">
        <div>
          <h3 className="font-serif text-lg font-semibold text-navy-900">นำเข้าจาก Notion</h3>
          <p className="text-sm text-navy-700/70 mt-1">
            ใน Notion กด <span className="font-medium">••• → Export → Markdown &amp; CSV</span> แล้วเลือกไฟล์ .md ที่ได้
            หรือจะก๊อปเนื้อหามาวางตรงนี้ก็ได้ (หัวข้อ ลิสต์ ช่องติ๊กถูก ตาราง โค้ด จะถูกแปลงให้ทั้งหมด)
          </p>
        </div>

        <div>
          <label className="label-field" htmlFor="import-title">
            ชื่อหน้า (เว้นว่างได้ จะใช้หัวข้อแรกในไฟล์)
          </label>
          <input id="import-title" value={title} onChange={(e) => setTitle(e.target.value)} className="input-field" />
        </div>

        <div>
          <label className="label-field" htmlFor="import-markdown">
            เนื้อหา Markdown
          </label>
          <textarea
            id="import-markdown"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            rows={10}
            placeholder="# หัวข้อ&#10;- รายการ&#10;- [ ] สิ่งที่ต้องทำ"
            className="input-field font-mono text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="btn-outline text-sm py-2 px-3 cursor-pointer inline-flex items-center gap-1.5">
            <IconUpload width={15} height={15} /> เลือกไฟล์ .md
            <input
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              className="hidden"
              onChange={(e) => {
                void onPickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-outline text-sm py-2 px-4">
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={!markdown.trim() || importMarkdown.isLoading}
              onClick={() => importMarkdown.mutate({ markdown, title: title.trim() || undefined })}
              className="btn-gold text-sm py-2 px-4"
            >
              {importMarkdown.isLoading ? "กำลังนำเข้า…" : "นำเข้าเป็นหน้าใหม่"}
            </button>
          </div>
        </div>

        {importMarkdown.error && <p className="text-red-700 text-sm">นำเข้าไม่สำเร็จ ลองใหม่อีกครั้ง</p>}
      </div>
    </div>
  );
}

function NotesInner() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("id");
  const activeTag = params.get("tag") ?? undefined;
  const activeSubject = params.get("subject") ?? undefined;

  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [fontsOpen, setFontsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  // Which note the draft was loaded from, so a background refetch of the same
  // note never overwrites what is being typed — only switching pages reloads.
  const loadedId = useRef<string | null>(null);
  // Unsaved-changes state, not a ref: the บันทึก button, the status line and
  // the leave-the-page warning all read it, so it has to cause a re-render.
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const utils = trpc.useUtils();
  const list = trpc.notes.list.useQuery({ search: search.trim() || undefined, tag: activeTag, subject: activeSubject });
  const subjects = trpc.subjects.list.useQuery();
  const tags = trpc.notes.tags.useQuery();
  const note = trpc.notes.get.useQuery({ id: selectedId! }, { enabled: !!selectedId });

  const fonts = useNoteFonts(true);

  const save = trpc.notes.update.useMutation({
    onSuccess: async () => {
      setDirty(false);
      setSavedAt(new Date());
      await utils.notes.list.invalidate();
      await utils.notes.tags.invalidate();
    },
  });

  const create = trpc.notes.create.useMutation({
    onSuccess: async (created) => {
      await utils.notes.list.invalidate();
      openNote(created.id);
    },
  });

  const remove = trpc.notes.remove.useMutation({
    onSuccess: async () => {
      setConfirmDelete(false);
      loadedId.current = null;
      setDraft(null);
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("id");
        return next;
      });
      await utils.notes.list.invalidate();
      await utils.notes.tags.invalidate();
    },
  });

  function openNote(id: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("id", id);
      return next;
    });
  }

  function setSubjectFilter(slug: string | undefined) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (slug) next.set("subject", slug);
      else next.delete("subject");
      return next;
    });
  }

  function setTagFilter(tag: string | undefined) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tag) next.set("tag", tag);
      else next.delete("tag");
      return next;
    });
  }

  // Load the opened note into the draft exactly once per note.
  useEffect(() => {
    if (!note.data || loadedId.current === note.data.id) return;
    loadedId.current = note.data.id;
    setDirty(false);
    setSavedAt(null);
    setDraft({
      title: note.data.title,
      icon: note.data.icon,
      contentHtml: note.data.contentHtml,
      tags: note.data.tags,
      isPinned: note.data.isPinned,
      subjectId: note.data.subjectId,
    });
  }, [note.data]);

  function saveNow() {
    if (!draft || !selectedId) return;
    save.mutate({
      id: selectedId,
      title: draft.title,
      icon: draft.icon,
      contentHtml: draft.contentHtml,
      tags: draft.tags,
      isPinned: draft.isPinned,
      subjectId: draft.subjectId,
    });
  }

  // Autosave: every edit restarts the clock, so a save lands once typing
  // pauses rather than on every keystroke.
  useEffect(() => {
    if (!draft || !selectedId || !dirty) return;
    const timer = setTimeout(saveNow, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // save.mutate is stable for the mutation's lifetime; re-running on it would
    // restart the timer on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, selectedId, dirty]);

  // Ctrl/Cmd+S saves, because that is what hands trained on Word do — and
  // without this the browser's own "save this page" dialog opens instead.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveNow();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, selectedId]);

  // The last line of defence: a tab closed inside the autosave window would
  // otherwise take the newest sentences with it, silently.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function edit(patch: Partial<Draft>) {
    setDirty(true);
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-navy-900">โน้ตของฉัน</h1>
          <p className="text-sm text-navy-700/70">ที่เขียนความรู้และสกิลไว้ให้ AI อ่านได้ — เห็นเฉพาะคุณที่ล็อกอินเท่านั้น</p>
        </div>
        <div className="flex gap-2">
          <Link to="/skills" className="btn-outline text-sm py-2 px-3">
            สกิลของฉัน
          </Link>
          <button type="button" onClick={() => setFontsOpen(true)} className="btn-outline text-sm py-2 px-3 inline-flex items-center gap-1.5">
            <IconFontFile width={15} height={15} /> ฟอนต์
          </button>
          <button type="button" onClick={() => setImportOpen(true)} className="btn-outline text-sm py-2 px-3 inline-flex items-center gap-1.5">
            <IconUpload width={15} height={15} /> นำเข้าจาก Notion
          </button>
          <button
            type="button"
            onClick={() => create.mutate({ title: "" })}
            disabled={create.isLoading}
            className="btn-gold text-sm py-2 px-3 inline-flex items-center gap-1.5"
          >
            <IconPlus width={15} height={15} /> หน้าใหม่
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[19rem_1fr] gap-5 items-start">
        <aside className={`card p-3 space-y-3 ${selectedId ? "hidden lg:block" : ""}`}>
          <div className="relative">
            <IconSearch width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-700/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นในโน้ตทั้งหมด"
              className="input-field py-2 pl-9 text-sm"
              aria-label="ค้นหาโน้ต"
            />
          </div>

          {(subjects.data?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSubjectFilter(undefined)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  !activeSubject ? "bg-navy-950 text-gold-400" : "border border-navy-900/15 text-navy-700 hover:border-gold-500"
                }`}
              >
                ทุกหมวด
              </button>
              {subjects.data?.map((subject) => (
                <button
                  key={subject.id}
                  type="button"
                  onClick={() => setSubjectFilter(subject.slug)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    activeSubject === subject.slug
                      ? "bg-navy-950 text-gold-400"
                      : "border border-navy-900/15 text-navy-700 hover:border-gold-500"
                  }`}
                >
                  {subject.icon ? `${subject.icon} ` : ""}
                  {subject.name}
                </button>
              ))}
            </div>
          )}

          {(tags.data?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setTagFilter(undefined)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  !activeTag ? "bg-navy-950 text-gold-400" : "border border-navy-900/15 text-navy-700 hover:border-gold-500"
                }`}
              >
                ทั้งหมด
              </button>
              {tags.data?.map((tag) => (
                <button
                  key={tag.tag}
                  type="button"
                  onClick={() => setTagFilter(tag.tag)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    activeTag === tag.tag ? "bg-navy-950 text-gold-400" : "border border-navy-900/15 text-navy-700 hover:border-gold-500"
                  }`}
                >
                  {tag.tag} <span className="opacity-50">{tag.count}</span>
                </button>
              ))}
            </div>
          )}

          <ul className="space-y-1 max-h-[65vh] overflow-y-auto">
            {list.data?.length === 0 && <li className="text-sm text-navy-700/60 px-2 py-6 text-center">ยังไม่มีโน้ต</li>}
            {list.data?.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openNote(item.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${
                    item.id === selectedId ? "bg-gold-400/15 border border-gold-500/40" : "hover:bg-navy-900/[0.04] border border-transparent"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="shrink-0">
                      {item.icon ? <span className="text-base leading-none">{item.icon}</span> : <IconDocument width={15} height={15} className="text-navy-700/40" />}
                    </span>
                    <span className="font-medium text-navy-900 text-sm truncate">{item.title || "ไม่มีชื่อ"}</span>
                    {item.isPinned && <IconBookmark width={13} height={13} className="text-gold-600 shrink-0 ml-auto" />}
                  </span>
                  {item.excerpt && <span className="block text-xs text-navy-700/55 truncate mt-0.5">{item.excerpt}</span>}
                  <span className="block text-[11px] text-navy-700/40 mt-1">{formatDate(item.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="space-y-4 min-w-0">
          {!selectedId && (
            <div className="card p-10 text-center text-navy-700/60">
              เลือกโน้ตทางซ้าย หรือกด “หน้าใหม่” เพื่อเริ่มเขียน
            </div>
          )}

          {selectedId && draft && (
            <div className="card p-4 sm:p-6">
              <NoteHeader
                title={draft.title}
                icon={draft.icon}
                tags={draft.tags}
                isPinned={draft.isPinned}
                dirty={dirty}
                saving={save.isLoading}
                savedAt={savedAt}
                onTitleChange={(title) => edit({ title })}
                onIconChange={(icon) => edit({ icon })}
                onTagsChange={(tags) => edit({ tags })}
                onTogglePin={() => edit({ isPinned: !draft.isPinned })}
                onSave={saveNow}
                onDelete={() => setConfirmDelete(true)}
                subjects={subjects.data ?? []}
                subjectId={draft.subjectId}
                onSubjectChange={(subjectId) => edit({ subjectId })}
              />

              <RichTextEditor
                key={selectedId}
                value={draft.contentHtml}
                onChange={(html) => edit({ contentHtml: html })}
                fontFamilies={fonts.map((font) => font.family)}
                onManageFonts={() => setFontsOpen(true)}
              />
            </div>
          )}

          {selectedId && note.isLoading && <div className="card p-10 text-center text-navy-700/60">กำลังเปิดหน้า…</div>}

          <KnowledgeChatPanel tag={activeTag} subject={activeSubject} />
        </section>
      </div>

      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImported={openNote} />}

      {fontsOpen && <FontManagerDialog onClose={() => setFontsOpen(false)} />}

      <ConfirmDialog
        open={confirmDelete}
        title="ลบหน้านี้ถาวร?"
        message={`"${draft?.title || "ไม่มีชื่อ"}" จะถูกลบและกู้คืนไม่ได้`}
        isBusy={remove.isLoading}
        onConfirm={() => selectedId && remove.mutate({ id: selectedId })}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

export default function Notes() {
  return (
    <AdminGate>
      <NotesInner />
    </AdminGate>
  );
}
