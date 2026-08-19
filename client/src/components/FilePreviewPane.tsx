import OfficePreview from "./OfficePreview";
import PdfReader from "./PdfReader";

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
    return <PdfReader url={previewUrl} fileId={fileId} pageOffset={pageOffset} title={title} />;
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
    return <OfficePreview kind="docx" html={html} />;
  }
  if (capability === "xlsx-inline") {
    if (isError || !sheets) return <PreviewError />;
    return <OfficePreview kind="xlsx" sheets={sheets} />;
  }
  return null;
}

function PreviewError() {
  return <div className="flex items-center justify-center h-[400px] text-red-700">ไม่สามารถโหลดตัวอย่างได้ ลองรีเฟรชหน้าอีกครั้ง</div>;
}
