import { Link, useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { fileTypeIcon } from "../lib/fileTypeIcon";
import FileActionsMenu from "./FileActionsMenu";

interface FileCardFile {
  id: string;
  title: string;
  author: string | null;
  year: number | null;
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
  const utils = trpc.useUtils();
  const Icon = fileTypeIcon(file.documentType);

  // A pointer resting on the card, or a finger landing on it, is a reliable
  // signal the file is about to be opened — and the answer takes the better
  // part of a second to come back from a sleepy free-tier API. Starting the
  // request here means it is usually already in the cache by the time the
  // click lands, and the reader's file page opens with no wait at all. The
  // response is cached by React Query, so an unused prefetch costs one
  // request and nothing else.
  const prefetch = () => {
    void utils.library.fileById.prefetch({ id: file.id });
    // The reader's code is a separate chunk; pull it in alongside the data.
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
      <FileActionsMenu file={file} />
    </div>
  );
}
