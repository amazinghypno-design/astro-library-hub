import { useParams, Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { IconDownload, IconExpand } from "../components/icons";
import FilePreviewPane from "../components/FilePreviewPane";
import ShareLinkPanel from "../components/ShareLinkPanel";
import BookChatPanel from "../components/BookChatPanel";
import { useAdminSession } from "../lib/useAdminSession";

export default function FileDetail() {
  const { id } = useParams<{ id: string }>();
  const isAdmin = useAdminSession();
  const fileQuery = trpc.library.fileById.useQuery({ id: id! }, { enabled: !!id });
  const capability = fileQuery.data?.preview;
  const needsRenderedHtml = capability === "docx-inline" || capability === "xlsx-inline";

  // The signed preview URL and the download link arrive with the metadata, so
  // opening a file costs one round-trip rather than two chained ones. Office
  // files still fetch their rendered HTML separately — that one is real work
  // on the server, not a link, and only these two formats need it.
  const previewHtmlQuery = trpc.library.previewHtml.useQuery({ id: id! }, { enabled: !!id && needsRenderedHtml });

  if (fileQuery.isLoading) return <div className="text-navy-700/60 py-12 text-center">กำลังโหลด...</div>;
  if (fileQuery.isError) return <div className="text-red-700 py-12 text-center">โหลดข้อมูลไฟล์ไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง</div>;
  if (!fileQuery.data) return <div className="text-navy-700/60 py-16 text-center">ไม่พบไฟล์นี้ หรือยังไม่ได้เผยแพร่</div>;

  const file = fileQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-navy-900">{file.title}</h1>
        <div className="text-navy-700/70 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {file.author && (
            <span>
              ผู้เขียน:{" "}
              <Link to={`/author/${encodeURIComponent(file.author)}`} className="text-gold-700 hover:underline font-medium">
                {file.author}
              </Link>
            </span>
          )}
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
        {file.previewUrl && (
          <a href={file.previewUrl} target="_blank" rel="noreferrer" className="btn-outline inline-flex items-center gap-2">
            <IconExpand width={18} height={18} /> เปิดเต็มหน้าต่าง
          </a>
        )}
      </div>

      <div className="card overflow-hidden min-h-[400px]">
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
        />
      </div>

      <BookChatPanel fileId={file.id} hasText={file.hasText} />

      {isAdmin && id && <ShareLinkPanel fileId={id} />}
    </div>
  );
}
