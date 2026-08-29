import FileCard, { BOOK_GRID_CLASS } from "./FileCard";
import FileRow from "./FileRow";
import { IconGridCover, IconListRows } from "./icons";
import { useViewMode, type ViewMode } from "../lib/useViewMode";

export interface CollectionFile {
  id: string;
  title: string;
  author: string | null;
  year: number | null;
  mimeType: string;
  documentType: "ebook" | "document" | "spreadsheet" | "program" | "slide" | "poster" | "other";
  categoryId: string | null;
  size: number;
  pageCount: number | null;
  hasCover?: boolean;
  coverVersion?: string | Date | null;
}

/**
 * Every list of files in the app, in one of two views the reader picks
 * between:
 *
 * - "cover" is the shelf. It shows each book's own front page and is the
 *   right answer when the question is "which one was that", because
 *   recognising a cover is faster than reading a title.
 * - "list" is the index. It shows no covers at all, deliberately: a cover is
 *   worth roughly ten rows of vertical space, and when the question is "what
 *   is in this category", forty rows on one screen beats eight covers over
 *   five screens.
 *
 * They are not two designs of the same thing — they answer different
 * questions, which is why the choice is the reader's and why it is
 * remembered (see lib/useViewMode.ts).
 */
export default function FileCollection({
  files,
  showToggle = true,
  forceMode,
}: {
  files: CollectionFile[];
  showToggle?: boolean;
  /** Pins one view regardless of the saved preference — the homepage's showcase row is always a shelf. */
  forceMode?: ViewMode;
}) {
  const [savedMode, setMode] = useViewMode();
  const mode = forceMode ?? savedMode;

  return (
    <div className="space-y-3">
      {showToggle && !forceMode && (
        <div className="flex justify-end">
          <div className="inline-flex rounded-lg border border-navy-900/12 p-0.5 bg-white/60">
            <ViewButton active={mode === "cover"} onClick={() => setMode("cover")} label="แบบหน้าปก">
              <IconGridCover width={16} height={16} />
            </ViewButton>
            <ViewButton active={mode === "list"} onClick={() => setMode("list")} label="แบบรายการ">
              <IconListRows width={16} height={16} />
            </ViewButton>
          </div>
        </div>
      )}

      {mode === "cover" ? (
        <div className={BOOK_GRID_CLASS}>
          {files.map((file) => (
            <FileCard key={file.id} file={file} />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-navy-900/[0.06]">
          {files.map((file) => (
            <FileRow key={file.id} file={file} />
          ))}
        </div>
      )}
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      // 46x40: this is reached with a thumb on a phone as often as with a
      // pointer, and the icon inside is only 16px.
      className={`px-3.5 py-2.5 rounded-md transition-colors ${
        active ? "bg-navy-950 text-gold-400" : "text-navy-700/50 hover:text-navy-900"
      }`}
    >
      {children}
    </button>
  );
}
