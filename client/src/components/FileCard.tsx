import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { coverUrl } from "../lib/coverUrl";
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
  hasCover?: boolean;
  coverVersion?: string | Date | null;
}

/**
 * The grid these cards are meant to sit in. Exported rather than repeated in
 * each page so the shelf stays one shelf: a card is now a book cover with a
 * fixed 3:4 face, and a two- or three-column layout built for text rows makes
 * those covers absurdly large.
 */
export const BOOK_GRID_CLASS = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6";

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

  // A cover the database claims exists can still fail to load — an object
  // deleted out from under the row, a storage blip. Falling back to the
  // designed placeholder is always better than a browser's broken-image icon
  // on a shelf.
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = !!file.hasCover && !coverFailed;

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
      className="group cursor-pointer focus:outline-none"
    >
      <div className="relative">
        <div className="aspect-[3/4] rounded-lg overflow-hidden bg-navy-900 shadow-card transition-all duration-200 group-hover:shadow-card-hover group-hover:-translate-y-1 group-focus:ring-2 group-focus:ring-gold-400/60">
          {showCover ? (
            <img
              src={coverUrl(file.id, file.coverVersion)}
              alt=""
              // Twenty covers on a shelf, most of them below the fold — the
              // browser is far better placed than we are to decide which
              // ones are worth fetching now.
              loading="lazy"
              decoding="async"
              onError={() => setCoverFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-b from-navy-800 to-navy-950 bg-hero-stars flex flex-col items-center justify-center gap-3 px-3 text-center">
              <Icon width={26} height={26} className="text-gold-400/80" />
              <div className="font-serif text-[13px] leading-snug text-ivory/90 line-clamp-4">{file.title}</div>
            </div>
          )}
          {/* The printed edge of a physical book — a hairline of shadow down
              the left side is most of what makes a flat rectangle read as a
              cover rather than a thumbnail. */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/25 to-transparent" />
        </div>

        <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <FileActionsMenu file={file} />
        </div>
      </div>

      <div className="mt-2.5">
        <div className="font-medium text-sm text-navy-900 leading-snug line-clamp-2">{file.title}</div>
        {file.author && (
          <Link
            to={`/author/${encodeURIComponent(file.author)}`}
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 text-xs text-navy-700/55 hover:text-gold-700 hover:underline inline-block line-clamp-1"
          >
            {file.author}
          </Link>
        )}
      </div>
    </div>
  );
}
