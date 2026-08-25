import type { Ref } from "react";
import OfficePreview from "./OfficePreview";
import PdfReader from "./PdfReader";
import type { ReaderHandle } from "../lib/useReaderFullscreen";

/**
 * Which previews are one of our own readers — the ones with a toolbar, and so
 * the ones a "อ่านเต็มจอ" button can hand over to instead of opening the raw
 * file in the browser's built-in viewer.
 */
export function hasOwnReader(capability: string) {
  return capability === "pdf-inline" || capability === "docx-inline" || capability === "xlsx-inline";
}

/** Shared by FileDetail (`/file/:id`) and ShareView (`/share/:token`) — one preview implementation, not two. */
export default function FilePreviewPane({
  capability,
  previewUrl,
  isLoading,
  isError,
  html,
  sheets,
  fileId,
  pageOffset,
  title,
  readerRef,
}: {
  capability: string;
  previewUrl?: string;
  isLoading: boolean;
  isError: boolean;
  html?: string;
  sheets?: { name: string; html: string }[];
  fileId?: string;
  pageOffset?: number;
  title?: string;
  /** Set for the capabilities `hasOwnReader` accepts; lets the page open the reader's fullscreen. */
  readerRef?: Ref<ReaderHandle>;
}) {
  if (capability === "unsupported" || capability === "download-fallback") {
    return (
      <div className="flex items-center justify-center h-[400px] text-navy-700/60 text-center px-6">
        ไฟล์ประเภทนี้ไม่รองรับการแสดงตัวอย่างบนเว็บ กรุณาใช้ปุ่มดาวน์โหลดด้านบน
      </div>
    );
  }
  if (isLoading) return <div className="flex items-center justify-center h-[400px] text-navy-700/60">กำลังเตรียมตัวอย่าง...</div>;

  if (capability === "pdf-inline") {
    if (isError || !previewUrl) return <PreviewError />;
    // Renders with our own PDF.js-based reader (PdfReader) instead of the
    // browser's native <embed>/<iframe> PDF viewer — that was unreliable in
    // practice (verified: a real 145-page scanned PDF rendered as a plain
    // black box in real desktop Chrome, with no visible error).
    return <PdfReader ref={readerRef} url={previewUrl} fileId={fileId} pageOffset={pageOffset} title={title} />;
  }
  if (capability === "image-inline") {
    if (isError || !previewUrl) return <PreviewError />;
    return <img src={previewUrl} alt="ตัวอย่างไฟล์" className="max-w-full mx-auto" />;
  }
  if (capability === "text-inline") {
    if (isError || !previewUrl) return <PreviewError />;
    return <iframe src={previewUrl} className="w-full h-[600px]" title="ตัวอย่างไฟล์ข้อความ" />;
  }
  if (capability === "docx-inline") {
    if (isError || !html) return <PreviewError />;
    return <OfficePreview ref={readerRef} kind="docx" html={html} fileId={fileId} title={title} />;
  }
  if (capability === "xlsx-inline") {
    if (isError || !sheets) return <PreviewError />;
    return <OfficePreview ref={readerRef} kind="xlsx" sheets={sheets} fileId={fileId} title={title} />;
  }
  return null;
}

function PreviewError() {
  return <div className="flex items-center justify-center h-[400px] text-red-700">ไม่สามารถโหลดตัวอย่างได้ ลองรีเฟรชหน้าอีกครั้ง</div>;
}
