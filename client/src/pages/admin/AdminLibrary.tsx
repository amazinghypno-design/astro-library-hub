import { Fragment, useEffect, useRef, useState } from "react";
import AdminGate from "../../components/AdminGate";
import { trpc } from "../../lib/trpc";
import { uploadFileDirect, type PreparedDirectUpload, type UploadProgress, type UploadStage } from "../../lib/upload";
import { renderCoverFromFile } from "../../lib/renderCover";
import CoverBackfillPanel from "../../components/CoverBackfillPanel";
import { IconEdit, IconPlus, IconTrash, IconUpload } from "../../components/icons";
import { explainAdminError } from "../../lib/explainAdminError";
import { toThaiErrorMessage } from "../../lib/errorMessages";
import ConfirmDialog from "../../components/ConfirmDialog";
import { takePendingUploadFile } from "../../lib/pendingUpload";
import { slugify } from "../../lib/slugify";

const STATUS_LABEL: Record<string, string> = { draft: "แบบร่าง", published: "เผยแพร่แล้ว", archived: "เก็บถาวร" };
type DocumentType = "ebook" | "document" | "spreadsheet" | "program" | "slide" | "poster" | "other";
const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  ebook: "E-book (PDF แนวตั้ง)",
  document: "เอกสาร (Word/ข้อความ)",
  spreadsheet: "ตารางข้อมูล (Excel/CSV)",
  program: "โปรแกรม Excel (.xlsm/.xlsb)",
  slide: "สไลด์ (PDF แนวนอน)",
  poster: "โปสเตอร์",
  other: "อื่นๆ",
};
const DOCUMENT_TYPE_OPTIONS: DocumentType[] = ["ebook", "document", "spreadsheet", "program", "slide", "poster", "other"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatSpeed(bytesPerSec: number): string {
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)} วิ`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes} นาที ${secs} วิ`;
}

const STAGE_LABEL: Partial<Record<UploadStage, string>> = {
  hashing: "กำลังตรวจสอบไฟล์",
  finalizing: "กำลังบันทึก",
  failed: "ล้มเหลว",
};

function AdminLibraryInner() {
  const utils = trpc.useUtils();
  const categories = trpc.library.categories.useQuery();
  const subjects = trpc.subjects.list.useQuery();
  const files = trpc.admin.adminFiles.useQuery();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [prepared, setPrepared] = useState<PreparedDirectUpload | null>(null);
  // Rendered from page 1 the moment the file is chosen, held until the row
  // exists — a cover needs a file id to belong to, and there is no id until
  // finalizeUpload returns.
  const [pendingCover, setPendingCover] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [year, setYear] = useState("");
  const [categoryId, setCategoryId] = useState("");
  // The upload picks a หมวดใหญ่ first and then a วิชา inside it, so a file can
  // never be filed into another subject's วิชา by accident.
  const [subjectId, setSubjectId] = useState("");
  const [status, setStatus] = useState<"draft" | "published" | "archived">("draft");
  const [stage, setStage] = useState<UploadStage | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [titleSuggested, setTitleSuggested] = useState(false);
  const [authorSuggested, setAuthorSuggested] = useState(false);
  const [documentType, setDocumentType] = useState<DocumentType>("other");
  const [documentTypeSuggested, setDocumentTypeSuggested] = useState(false);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Only the วิชา that live in the chosen หมวดใหญ่ — the second dropdown can
  // never offer another subject's.
  const categoriesInSubject = (categories.data ?? []).filter((c) => c.subjectId === subjectId);

  const createCategory = trpc.admin.createCategory.useMutation({
    onSuccess: async (created) => {
      await utils.library.categories.invalidate();
      setCategoryId(created.id);
      setNewCategoryName("");
      setNewCategoryOpen(false);
    },
    onError: (err) => alert(explainAdminError(err)),
  });

  function submitNewCategory() {
    if (!newCategoryName.trim()) return;
    createCategory.mutate({ name: newCategoryName, slug: slugify(newCategoryName), subjectId });
  }

  const createUploadUrl = trpc.admin.createUploadUrl.useMutation();
  const inspectFile = trpc.admin.inspectFile.useMutation();
  const saveCover = trpc.admin.saveCover.useMutation();

  // Picks up a file dropped on the Home page's upload button before login
  // redirected here — see lib/pendingUpload.ts.
  useEffect(() => {
    const pending = takePendingUploadFile();
    if (pending) void handleFileChosen(pending);
  }, []);

  const finalizeUpload = trpc.admin.finalizeUpload.useMutation({
    onSuccess: async () => {
      setStage("completed");
      await utils.admin.adminFiles.invalidate();
      await utils.library.dashboard.invalidate();
      await utils.library.categories.invalidate();
      resetForm();
    },
    onError: (err) => {
      setStage("failed");
      const cause = err.data as unknown as { cause?: { existingTitle?: string; existingFileName?: string } };
      if (err.message === "DUPLICATE_FILE" && cause?.cause) {
        setErrorMessage(`ไฟล์นี้ซ้ำกับ "${cause.cause.existingTitle}" (${cause.cause.existingFileName}) ที่มีอยู่แล้วในหมวดนี้`);
      } else {
        setErrorMessage(toThaiErrorMessage(err, "บันทึกไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
      }
    },
  });

  const updateFile = trpc.admin.updateFile.useMutation({
    onSuccess: async () => {
      await utils.admin.adminFiles.invalidate();
      await utils.library.dashboard.invalidate();
    },
    onError: (err) => alert(explainAdminError(err)),
  });

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editYear, setEditYear] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editDocumentType, setEditDocumentType] = useState<DocumentType>("other");
  const [editPageOffset, setEditPageOffset] = useState("0");

  function startEdit(f: {
    id: string;
    title: string;
    author: string | null;
    year: number | null;
    categoryId: string | null;
    documentType: DocumentType;
    pageOffset: number;
  }) {
    setEditingId(f.id);
    setEditTitle(f.title);
    setEditAuthor(f.author ?? "");
    setEditYear(f.year != null ? String(f.year) : "");
    setEditCategoryId(f.categoryId ?? "");
    setEditDocumentType(f.documentType);
    setEditPageOffset(String(f.pageOffset));
  }

  async function saveEdit(id: string) {
    await updateFile.mutateAsync({
      id,
      title: editTitle,
      author: editAuthor || undefined,
      year: editYear ? Number(editYear) : undefined,
      categoryId: editCategoryId || undefined,
      documentType: editDocumentType,
      pageOffset: editPageOffset === "" ? 0 : Number(editPageOffset),
    });
    setEditingId(null);
  }

  const deleteFile = trpc.admin.deleteFile.useMutation({
    onSuccess: async () => {
      await utils.admin.adminFiles.invalidate();
      await utils.library.dashboard.invalidate();
      setConfirmingDeleteId(null);
    },
    onError: (err) => {
      setConfirmingDeleteId(null);
      alert(explainAdminError(err));
    },
  });

  function resetForm() {
    setSelectedFile(null);
    setPrepared(null);
    setTitle("");
    setAuthor("");
    setYear("");
    // categoryId is deliberately kept — admins usually upload several files
    // to the same category in a row, so re-clearing it here would force
    // re-selecting it every single time.
    setStatus("draft");
    setStage(null);
    setUploadProgress(null);
    setErrorMessage(null);
    setPageCount(null);
    setTitleSuggested(false);
    setAuthorSuggested(false);
    setDocumentType("other");
    setDocumentTypeSuggested(false);
    setPendingCover(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileChosen(file: File) {
    setSelectedFile(file);
    setPendingCover(null);
    setErrorMessage(null);
    setStage(null);
    setUploadProgress(null);
    setPageCount(null);
    const fallbackTitle = file.name.replace(/\.[^.]+$/, "");
    setTitle(fallbackTitle);
    setTitleSuggested(false);
    setAuthorSuggested(false);
    setDocumentType("other");
    setDocumentTypeSuggested(false);

    try {
      // Uploads straight to storage (R2/Supabase) — never through our own
      // server — so this is limited only by the admin's own connection to
      // the storage provider, not by an extra hop plus gzip/base64 overhead.
      const result = await uploadFileDirect(
        file,
        (input) => createUploadUrl.mutateAsync(input),
        setStage,
        setUploadProgress,
      );
      setPrepared(result);
      setStage("finalizing");

      const suggestion = await inspectFile.mutateAsync({
        storageKey: result.storageKey,
        mimeType: result.mimeType,
        originalName: file.name,
      });
      setStage(null);
      setPageCount(suggestion.pageCount);
      setDocumentType(suggestion.documentType);
      setDocumentTypeSuggested(true);
      if (suggestion.title) {
        setTitle(suggestion.title.value);
        setTitleSuggested(true);
      }
      if (suggestion.author) {
        setAuthor(suggestion.author.value);
        setAuthorSuggested(true);
      }

      // From the local File, not from storage: the bytes are already on this
      // machine, so the cover costs no download and no server CPU at all.
      // Deliberately last and deliberately unable to throw — a book with no
      // cover is a plainer card, while a failed upload is lost work.
      setPendingCover((await renderCoverFromFile(file))?.base64 ?? null);
    } catch (err) {
      setStage("failed");
      setErrorMessage(toThaiErrorMessage(err, "อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFileChosen(file);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!prepared || !categoryId || !title) return;
    // Captured before the mutation runs: finalizeUpload's onSuccess resets the
    // form (clearing pendingCover) and resolves before mutateAsync returns.
    const coverToSave = pendingCover;
    setErrorMessage(null);
    setStage("finalizing");
    try {
      const created = await finalizeUpload.mutateAsync({
        ...prepared,
        categoryId,
        title,
        author: author || undefined,
        year: year ? Number(year) : undefined,
        status,
        documentType,
        tags: [],
      });

      // After the row is safely written, never before, and never in a way
      // that can undo it: the file is saved either way, and a missing cover
      // is repairable from the backfill panel below.
      if (coverToSave) {
        await saveCover.mutateAsync({ fileId: created.id, imageBase64: coverToSave }).catch(() => {});
        await utils.library.files.invalidate();
        await utils.library.dashboard.invalidate();
      }
    } catch (err) {
      setStage("failed");
      setErrorMessage(toThaiErrorMessage(err, "บันทึกไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-navy-900">จัดการคลังไฟล์</h1>

      <section
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-2xl border-2 border-dashed p-6 transition-colors ${
          dragOver ? "border-gold-500 bg-gold-400/5" : "border-navy-900/15 bg-white/50"
        }`}
      >
        {!selectedFile && (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center bg-navy-950/5 text-navy-700 rounded-full p-4 mb-4">
              <IconUpload width={28} height={28} />
            </div>
            <p className="text-navy-800 mb-4">ลากไฟล์มาวางที่นี่ หรือ</p>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-primary">
              เลือกไฟล์
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileChosen(e.target.files[0])}
            />
          </div>
        )}

        {selectedFile && (
          <form onSubmit={onSave} className="space-y-4">
            <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-navy-900/10">
              <div>
                <div className="font-medium text-navy-900">{selectedFile.name}</div>
                <div className="text-sm text-navy-700/55">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  {pageCount != null && ` · ${pageCount} หน้า`}
                </div>
              </div>
              <button
                type="button"
                onClick={resetForm}
                aria-label="ล้างไฟล์ที่เลือก"
                className="text-navy-700/50 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition-colors"
              >
                <IconTrash width={18} height={18} />
              </button>
            </div>

            {stage === "uploading" && uploadProgress && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm text-navy-700">
                  <span>กำลังอัปโหลด...</span>
                  <span className="tabular-nums font-medium">
                    {Math.round((uploadProgress.loadedBytes / uploadProgress.totalBytes) * 100)}%
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-navy-900/[0.08] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-400 transition-[width] duration-150"
                    style={{ width: `${Math.max((uploadProgress.loadedBytes / uploadProgress.totalBytes) * 100, 2)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-navy-700/55 tabular-nums">
                  <span>
                    {formatBytes(uploadProgress.loadedBytes)} / {formatBytes(uploadProgress.totalBytes)}
                  </span>
                  <span>
                    {formatSpeed(uploadProgress.speedBytesPerSec)}
                    {uploadProgress.etaSeconds != null && ` · เหลือ ${formatEta(uploadProgress.etaSeconds)}`}
                  </span>
                </div>
              </div>
            )}
            {stage && stage !== "completed" && stage !== "uploading" && (
              <div className="text-sm text-navy-700">สถานะ: {STAGE_LABEL[stage]}</div>
            )}
            {inspectFile.isLoading && (
              <div className="text-sm text-navy-700/60">กำลังอ่านหน้าปกเพื่อแนะนำชื่อเรื่อง/ผู้เขียน...</div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label-field" htmlFor="title">
                  ชื่อเรื่อง * {titleSuggested && <span className="text-gold-600 font-normal">(แนะนำอัตโนมัติ ตรวจสอบก่อนบันทึก)</span>}
                </label>
                <input
                  id="title"
                  required
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleSuggested(false);
                  }}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-field" htmlFor="author">
                  ผู้เขียน {authorSuggested && <span className="text-gold-600 font-normal">(แนะนำอัตโนมัติ)</span>}
                </label>
                <input
                  id="author"
                  value={author}
                  onChange={(e) => {
                    setAuthor(e.target.value);
                    setAuthorSuggested(false);
                  }}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-field" htmlFor="year">ปี</label>
                <input id="year" type="number" value={year} onChange={(e) => setYear(e.target.value)} className="input-field" />
              </div>
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="label-field" htmlFor="category">หมวดหมู่ *</label>
                  <button
                    type="button"
                    onClick={() => setNewCategoryOpen((v) => !v)}
                    className="inline-flex items-center gap-1 text-sm text-gold-600 hover:text-gold-700 font-medium mb-1.5"
                  >
                    <IconPlus width={14} height={14} /> สร้างวิชาใหม่
                  </button>
                </div>
                <select
                  id="subject"
                  required
                  value={subjectId}
                  onChange={(e) => {
                    setSubjectId(e.target.value);
                    setCategoryId("");
                  }}
                  className="input-field mb-2"
                  aria-label="หมวดใหญ่"
                >
                  <option value="" disabled>
                    เลือกหมวดใหญ่
                  </option>
                  {subjects.data?.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.icon ? `${subject.icon} ` : ""}
                      {subject.name}
                    </option>
                  ))}
                </select>
                <select
                  id="category"
                  required
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  disabled={!subjectId}
                  className="input-field disabled:opacity-50"
                >
                  <option value="" disabled>
                    {subjectId ? "เลือกวิชา" : "เลือกหมวดใหญ่ก่อน"}
                  </option>
                  {categoriesInSubject.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {newCategoryOpen && (
                  <div className="mt-2 flex gap-2 bg-navy-900/[0.03] rounded-xl p-2.5">
                    <input
                      autoFocus
                      placeholder="ชื่อวิชาใหม่"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          submitNewCategory();
                        }
                      }}
                      className="input-field flex-1"
                    />
                    <button
                      type="button"
                      onClick={submitNewCategory}
                      disabled={createCategory.isLoading || !newCategoryName.trim()}
                      className="btn-primary text-sm px-4"
                    >
                      {createCategory.isLoading ? "กำลังสร้าง..." : "สร้าง"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewCategoryOpen(false);
                        setNewCategoryName("");
                      }}
                      className="btn-outline text-sm px-4"
                    >
                      ยกเลิก
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="label-field" htmlFor="status">สถานะ</label>
                <select id="status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="input-field">
                  <option value="draft">แบบร่าง</option>
                  <option value="published">เผยแพร่</option>
                  <option value="archived">เก็บถาวร</option>
                </select>
              </div>
              <div>
                <label className="label-field" htmlFor="documentType">
                  ประเภทเอกสาร {documentTypeSuggested && <span className="text-gold-600 font-normal">(แนะนำอัตโนมัติ ตรวจสอบก่อนบันทึก)</span>}
                </label>
                <select
                  id="documentType"
                  value={documentType}
                  onChange={(e) => {
                    setDocumentType(e.target.value as DocumentType);
                    setDocumentTypeSuggested(false);
                  }}
                  className="input-field"
                >
                  {DOCUMENT_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{DOCUMENT_TYPE_LABEL[t]}</option>
                  ))}
                </select>
              </div>
            </div>

            {errorMessage && <div className="text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errorMessage}</div>}

            {!errorMessage && (!prepared || !categoryId || !title) && (
              <div className="text-sm text-navy-700/70 bg-navy-900/[0.04] border border-navy-900/10 rounded-lg px-3 py-2">
                ยังบันทึกไม่ได้ ต้องมีครบก่อน:{" "}
                {[!prepared && "รออัปโหลดไฟล์ให้เสร็จ", !title && "ใส่ชื่อเรื่อง", !subjectId && "เลือกหมวดใหญ่", !categoryId && "เลือกวิชา"]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}

            <button type="submit" disabled={!prepared || !categoryId || !title || finalizeUpload.isLoading} className="btn-gold">
              {finalizeUpload.isLoading ? "กำลังบันทึก..." : "บันทึกไฟล์"}
            </button>
          </form>
        )}
      </section>

      <section>
        <h2 className="font-serif text-lg font-semibold text-navy-900 mb-3">ไฟล์ทั้งหมด</h2>
        {files.data && files.data.length === 0 && <div className="card text-navy-700/60 py-8 text-center">ยังไม่มีไฟล์ในระบบ</div>}
        {files.data && files.data.length > 0 && (
          <div className="overflow-x-auto card p-0">
            <table className="w-full text-sm">
              <thead className="bg-navy-950 text-ivory text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">ชื่อเรื่อง</th>
                  <th className="px-4 py-3 font-medium">ชนิด</th>
                  <th className="px-4 py-3 font-medium">สถานะ</th>
                  <th className="px-4 py-3 font-medium">การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {files.data.map((f) => (
                  <Fragment key={f.id}>
                    <tr className="border-t border-navy-900/[0.06]">
                      <td className="px-4 py-3">{f.title}</td>
                      <td className="px-4 py-3 text-navy-700/60">{DOCUMENT_TYPE_LABEL[f.documentType as DocumentType]}</td>
                      <td className="px-4 py-3">
                        <select
                          value={f.status}
                          onChange={(e) => updateFile.mutate({ id: f.id, status: e.target.value as "draft" | "published" | "archived" })}
                          className="rounded-lg border border-navy-900/15 px-2 py-1.5 bg-white"
                        >
                          <option value="draft">{STATUS_LABEL.draft}</option>
                          <option value="published">{STATUS_LABEL.published}</option>
                          <option value="archived">{STATUS_LABEL.archived}</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => (editingId === f.id ? setEditingId(null) : startEdit(f))}
                            className="inline-flex items-center gap-1.5 text-navy-700 hover:text-gold-600"
                          >
                            <IconEdit width={15} height={15} /> แก้ไข
                          </button>
                          <button
                            onClick={() => setConfirmingDeleteId(f.id)}
                            className="inline-flex items-center gap-1.5 text-red-700 hover:text-red-800 hover:underline"
                          >
                            <IconTrash width={15} height={15} /> ลบ
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editingId === f.id && (
                      <tr className="bg-navy-900/[0.02] border-t border-navy-900/[0.06]">
                        <td colSpan={4} className="px-4 py-4">
                          <div className="grid sm:grid-cols-6 gap-3">
                            <div>
                              <label className="label-field">ชื่อเรื่อง</label>
                              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="input-field" />
                            </div>
                            <div>
                              <label className="label-field">ผู้เขียน</label>
                              <input value={editAuthor} onChange={(e) => setEditAuthor(e.target.value)} className="input-field" />
                            </div>
                            <div>
                              <label className="label-field">ปี</label>
                              <input type="number" value={editYear} onChange={(e) => setEditYear(e.target.value)} className="input-field" />
                            </div>
                            <div>
                              <label className="label-field">หมวดหมู่</label>
                              <select value={editCategoryId} onChange={(e) => setEditCategoryId(e.target.value)} className="input-field">
                                {categories.data?.map((c) => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="label-field">ประเภทเอกสาร</label>
                              <select value={editDocumentType} onChange={(e) => setEditDocumentType(e.target.value as DocumentType)} className="input-field">
                                {DOCUMENT_TYPE_OPTIONS.map((t) => (
                                  <option key={t} value={t}>{DOCUMENT_TYPE_LABEL[t]}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="label-field" title="ถ้าเลขหน้าในสารบัญไม่ตรงกับหน้าไฟล์ เช่น มีปกและคำนำ 9 หน้าก่อนเนื้อหาจริง ให้ใส่ 9">
                                เลขหน้าอ้างอิง (สารบัญ)
                              </label>
                              <input
                                type="number"
                                value={editPageOffset}
                                onChange={(e) => setEditPageOffset(e.target.value)}
                                className="input-field"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <button onClick={() => saveEdit(f.id)} disabled={updateFile.isLoading || !editTitle} className="btn-primary text-sm px-4 py-2">
                              {updateFile.isLoading ? "กำลังบันทึก..." : "บันทึก"}
                            </button>
                            <button onClick={() => setEditingId(null)} className="btn-outline text-sm px-4 py-2">
                              ยกเลิก
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CoverBackfillPanel />

      <ConfirmDialog
        open={!!confirmingDeleteId}
        title="ลบไฟล์นี้ถาวร?"
        message={`"${files.data?.find((f) => f.id === confirmingDeleteId)?.title ?? ""}" จะถูกลบและกู้คืนไม่ได้`}
        isBusy={deleteFile.isLoading}
        onConfirm={() => confirmingDeleteId && deleteFile.mutate({ id: confirmingDeleteId })}
        onCancel={() => setConfirmingDeleteId(null)}
      />
    </div>
  );
}

export default function AdminLibrary() {
  return (
    <AdminGate>
      <AdminLibraryInner />
    </AdminGate>
  );
}
