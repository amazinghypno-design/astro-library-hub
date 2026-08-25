import { useRef } from "react";
import { useParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { IconDownload, IconExpand } from "../components/icons";
import FilePreviewPane, { hasOwnReader } from "../components/FilePreviewPane";
import type { ReaderHandle } from "../lib/useReaderFullscreen";

/** Public view for a share-link token — deliberately does not require login, and can show a Draft file. */
export default function ShareView() {
  const { token } = useParams<{ token: string }>();
  const fileQuery = trpc.library.fileByShareToken.useQuery({ token: token! }, { enabled: !!token, retry: false });
  const capability = fileQuery.data?.preview;
  const needsRenderedHtml = capability === "docx-inline" || capability === "xlsx-inline";

  // Links ride along with the metadata — see the same note in FileDetail.
  const previewHtmlQuery = trpc.library.previewHtml.useQuery({ token: token! }, { enabled: !!token && needsRenderedHtml });

  // Scroll the reader into view first, so leaving fullscreen later lands the
  // reader on screen rather than back at the top of the page.
  const readerRef = useRef<ReaderHandle>(null);
  const readerBoxRef = useRef<HTMLDivElement>(null);
  function openFullscreen() {
    readerBoxRef.current?.scrollIntoView({ block: "start" });
    readerRef.current?.enterFullscreen();
  }

  if (fileQuery.isLoading) return <div className="text-navy-700/60 py-12 text-center">กำลังโหลด...</div>;
  if (fileQuery.isError || !fileQuery.data) {
    return (
      <div className="py-16 text-center space-y-2">
        <div className="text-navy-700/70 font-medium">ลิงก์นี้ใช้งานไม่ได้แล้ว</div>
        <div className="text-navy-700/50 text-sm">อาจหมดอายุ ถูกปิดโดยเจ้าของ หรือพิมพ์ลิงก์ผิด</div>
      </div>
    );
  }

  const file = fileQuery.data;

  return (
    <div className="space-y-6">
      <div className="bg-gold-400/10 border border-gold-500/30 rounded-xl px-4 py-2.5 text-sm text-navy-800">
        คุณกำลังดูไฟล์นี้ผ่านลิงก์ส่วนตัว — ไม่ปรากฏในคลังสาธารณะ
      </div>
      <div>
        <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-navy-900">{file.title}</h1>
        <div className="text-navy-700/70 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {file.author && <span>ผู้เขียน: {file.author}</span>}
          {file.year && <span>ปี: {file.year}</span>}
          {file.pageCount != null && <span>{file.pageCount} หน้า</span>}
          <span>ชนิดไฟล์: {file.mimeType}</span>
          <span>ขนาด: {(file.size / 1024 / 1024).toFixed(2)} MB</span>
        </div>
        {file.description && <p className="text-navy-800 mt-3">{file.description}</p>}
      </div>

      <div className="flex gap-3">
        <a href={file.downloadUrl} className="btn-gold inline-flex items-center gap-2">
          <IconDownload width={18} height={18} /> ดาวน์โหลด
        </a>
        {/* Reading fullscreen goes through our own reader, not the browser's
            built-in viewer: the toolbar — ปากกา, ไฮไลต์, แคปหน้านี้ — comes with
            it, which is the whole reason to be in the reader at all. Formats we
            have no reader for still open in a new tab. */}
        {hasOwnReader(file.preview) ? (
          <button type="button" onClick={openFullscreen} className="btn-outline inline-flex items-center gap-2">
            <IconExpand width={18} height={18} /> อ่านเต็มจอ
          </button>
        ) : (
          file.previewUrl && (
            <a href={file.previewUrl} target="_blank" rel="noreferrer" className="btn-outline inline-flex items-center gap-2">
              <IconExpand width={18} height={18} /> เปิดเต็มหน้าต่าง
            </a>
          )
        )}
      </div>

      <div ref={readerBoxRef} className="card overflow-hidden min-h-[400px]">
        <FilePreviewPane
          capability={file.preview}
          previewUrl={file.previewUrl ?? undefined}
          isLoading={needsRenderedHtml && previewHtmlQuery.isLoading}
          isError={needsRenderedHtml && previewHtmlQuery.isError}
          html={previewHtmlQuery.data?.html ?? undefined}
          sheets={previewHtmlQuery.data?.sheets ?? undefined}
          fileId={file.id}
          pageOffset={file.pageOffset}
          title={file.title}
          readerRef={readerRef}
        />
      </div>
    </div>
  );
}
