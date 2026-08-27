import { Link, useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { fileTypeIcon } from "../lib/fileTypeIcon";
import FileActionsMenu from "./FileActionsMenu";
import type { CollectionFile } from "./FileCollection";

const TYPE_LABEL: Record<CollectionFile["documentType"], string> = {
  ebook: "E-book",
  document: "เอกสาร",
  spreadsheet: "ตารางข้อมูล",
  slide: "สไลด์",
  poster: "โปสเตอร์",
  other: "ไฟล์",
};

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * The dense half of the pair — see components/FileCollection.tsx. No cover by
 * design: this view exists for the moment when the question is "what is in
 * here", and forty covers answer that far worse than forty titles on one
 * screen do. Everything a cover would have carried visually (type, length,
 * weight) is spelled out as text instead.
 */
export default function FileRow({ file }: { file: CollectionFile }) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const Icon = fileTypeIcon(file.documentType);

  const prefetch = () => {
    void utils.library.fileById.prefetch({ id: file.id });
    void import("../pages/FileDetail");
  };

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/file/${file.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate(`/file/${file.id}`);
      }}
      onMouseEnter={prefetch}
      onTouchStart={prefetch}
      onFocus={prefetch}
      className="group flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-gold-400/50"
    >
      <Icon width={18} height={18} className="text-gold-600 shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-navy-900 truncate">{file.title}</div>
        {file.author && (
          <Link
            to={`/author/${encodeURIComponent(file.author)}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-navy-700/55 hover:text-gold-700 hover:underline"
          >
            {file.author}
          </Link>
        )}
      </div>

      <div className="hidden sm:flex items-center gap-3 text-xs text-navy-700/45 shrink-0 tabular-nums">
        <span>{TYPE_LABEL[file.documentType]}</span>
        {file.pageCount != null && <span>{file.pageCount} หน้า</span>}
        {file.year != null && <span>{file.year}</span>}
        <span className="w-16 text-right">{formatSize(file.size)}</span>
      </div>

      <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
        <FileActionsMenu file={file} />
      </div>
    </div>
  );
}
