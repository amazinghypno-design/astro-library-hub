import { useParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { IconDownload, IconExpand } from "../components/icons";
import FilePreviewPane from "../components/FilePreviewPane";

/** Public view for a share-link token — deliberately does not require login, and can show a Draft file. */
export default function ShareView() {
  const { token } = useParams<{ token: string }>();
  const fileQuery = trpc.library.fileByShareToken.useQuery({ token: token! }, { enabled: !!token, retry: false });
  const capability = fileQuery.data?.preview;
  const needsSignedUrl = capability === "pdf-inline" || capability === "image-inline" || capability === "text-inline";
  const needsRenderedHtml = capability === "docx-inline" || capability === "xlsx-inline";

  const previewQuery = trpc.library.previewUrl.useQuery({ token: token! }, { enabled: !!token && needsSignedUrl });
  const previewHtmlQuery = trpc.library.previewHtml.useQuery({ token: token! }, { enabled: !!token && needsRenderedHtml });
  const downloadQuery = trpc.library.downloadUrl.useQuery({ token: token! }, { enabled: !!token && !!fileQuery.data });

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
        {downloadQuery.data && (
          <a href={downloadQuery.data.url} className="btn-gold inline-flex items-center gap-2">
            <IconDownload width={18} height={18} /> ดาวน์โหลด
          </a>
        )}
        {previewQuery.data && (
          <a href={previewQuery.data.url} target="_blank" rel="noreferrer" className="btn-outline inline-flex items-center gap-2">
            <IconExpand width={18} height={18} /> เปิดเต็มหน้าต่าง
          </a>
        )}
      </div>

      <div className="card overflow-hidden min-h-[400px]">
        <FilePreviewPane
          capability={file.preview}
          previewUrl={previewQuery.data?.url}
          isLoading={needsSignedUrl ? previewQuery.isLoading : previewHtmlQuery.isLoading}
          isError={needsSignedUrl ? previewQuery.isError : previewHtmlQuery.isError}
          html={previewHtmlQuery.data?.html ?? undefined}
          sheets={previewHtmlQuery.data?.sheets ?? undefined}
          fileId={file.id}
          pageOffset={file.pageOffset}
        />
      </div>
    </div>
  );
}
