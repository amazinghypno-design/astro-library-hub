import { Link, useNavigate } from "react-router-dom";
import { fileTypeIcon } from "../lib/fileTypeIcon";
import FileCardActions from "./FileCardActions";

interface FileCardFile {
  id: string;
  title: string;
  author: string | null;
  mimeType: string;
  documentType: "ebook" | "document" | "spreadsheet" | "slide" | "poster" | "other";
  categoryId: string | null;
}

/**
 * The whole card navigates to the file on click, but the author name is its
 * own real link to `/author/:name` — deliberately NOT nesting an <a> inside
 * an <a> (invalid HTML, breaks click targets), so the card itself is a div
 * with a click handler rather than a router <Link>. See TROUBLESHOOTING-HANDBOOK.md.
 */
export default function FileCard({ file }: { file: FileCardFile }) {
  const navigate = useNavigate();
  const Icon = fileTypeIcon(file.documentType);

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/file/${file.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate(`/file/${file.id}`);
      }}
      className="card-interactive p-4 flex items-start gap-3 cursor-pointer"
    >
      <Icon width={20} height={20} className="text-gold-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-navy-900 mb-1">{file.title}</div>
        {file.author && (
          <Link
            to={`/author/${encodeURIComponent(file.author)}`}
            onClick={(e) => e.stopPropagation()}
            className="text-sm text-navy-700/55 hover:text-gold-700 hover:underline inline-block"
          >
            {file.author}
          </Link>
        )}
      </div>
      <FileCardActions fileId={file.id} title={file.title} categoryId={file.categoryId} />
    </div>
  );
}
