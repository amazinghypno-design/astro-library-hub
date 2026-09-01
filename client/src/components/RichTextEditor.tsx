import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { IconChevronDown, IconEraser, IconHighlighter, IconTrash, IconUndo } from "./icons";
import DictationButton from "./DictationButton";
import ProofreadButton from "./ProofreadButton";
import { ProofreadHighlight } from "../lib/proofread";
import {
  IconAlignCenter,
  IconAlignJustify,
  IconAlignLeft,
  IconAlignRight,
  IconBold,
  IconCode,
  IconChevronsDown,
  IconChevronsUp,
  IconCodeBlock,
  IconFont,
  IconHorizontalRule,
  IconImage,
  IconIndent,
  IconItalic,
  IconLink,
  IconListBullet,
  IconListOrdered,
  IconListTask,
  IconOutdent,
  IconPalette,
  IconQuote,
  IconRedo,
  IconStrikethrough,
  IconTable,
  IconTextSize,
  IconUnderline,
  IconUnlink,
} from "./editorIcons";

/**
 * The writing surface for the whole notebook — one editor, used by the
 * notes page and by every skill's own page.
 *
 * Built on Tiptap (ProseMirror) rather than a contentEditable driven by
 * `document.execCommand`. execCommand is a dozen lines to start and then
 * fights you forever: it is deprecated, each browser implements it slightly
 * differently, and the structures it produces on nested lists, checkboxes and
 * tables are unpredictable enough that a page can be corrupted by ordinary
 * typing. ProseMirror edits a validated document instead, which is what makes
 * "paste a whole page out of Notion and have it still be a page" work at all
 * — anything that doesn't fit the schema is dropped on the way in rather than
 * stored as broken markup.
 *
 * The value is HTML, because HTML is what the server stores and sanitizes
 * (server/src/domain/noteContent.ts) and what a document paste already
 * carries. Callers give this component a `key` tied to the page being edited,
 * so switching pages remounts the editor with a clean history rather than
 * letting one page's undo stack reach into another's.
 */

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Extra classes for the scrollable writing area (height is the caller's choice). */
  contentClassName?: string;
  editable?: boolean;
  /** Families the owner uploaded (lib/useNoteFonts.ts) — listed after the two the site ships. */
  fontFamilies?: string[];
  /** Opens the font manager from inside the font menu; the entry is hidden when absent. */
  onManageFonts?: () => void;
}

const TEXT_COLORS: { label: string; value: string }[] = [
  { label: "ดำน้ำเงิน", value: "#0a0f1f" },
  { label: "เทา", value: "#5b6480" },
  { label: "ทอง", value: "#b8893a" },
  { label: "แดง", value: "#b91c1c" },
  { label: "เขียว", value: "#15803d" },
  { label: "ฟ้า", value: "#1d4ed8" },
  { label: "ม่วง", value: "#7e22ce" },
];

const HIGHLIGHT_COLORS: { label: string; value: string }[] = [
  { label: "เหลือง", value: "#fde68a" },
  { label: "ทอง", value: "#e8c168" },
  { label: "เขียว", value: "#bbf7d0" },
  { label: "ฟ้า", value: "#bfdbfe" },
  { label: "ชมพู", value: "#fbcfe8" },
];

/**
 * The two faces the site itself loads (see client/index.html). Anything else
 * in this menu is a font the owner uploaded — there is no long list of
 * system fonts, because a font that only exists on this machine would make a
 * note look different on their phone.
 */
const BUILT_IN_FONTS: { label: string; value: string | null }[] = [
  { label: "ฟอนต์เริ่มต้น", value: null },
  { label: "Noto Sans Thai (เรียบ)", value: "Noto Sans Thai" },
  { label: "Noto Serif Thai (มีหัว)", value: "Noto Serif Thai" },
];

const FONT_SIZES: { label: string; value: string | null }[] = [
  { label: "เล็ก", value: "14px" },
  { label: "ปกติ", value: null },
  { label: "ใหญ่", value: "20px" },
  { label: "ใหญ่มาก", value: "26px" },
];

/**
 * A pasted or chosen photo is inlined into the note as a data: URI, so a page
 * stays one self-contained row and needs no upload, no object key and no
 * cleanup when it is deleted. That only holds if the bytes are small, so
 * every image is redrawn to at most 1200px wide as WebP before it goes in —
 * a 4MB phone photo lands at roughly 100KB, and the note stays well inside
 * the size the server accepts.
 */
const MAX_IMAGE_WIDTH = 1200;

async function fileToInlineImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.82);
}

/**
 * Where a space belongs between the phrase just spoken and the text already
 * in the document.
 *
 * Thai does not put spaces between words, so the recogniser settling a phrase
 * is not a reason to add one: talking without stopping has to come out as one
 * unbroken run of Thai. A space is added for exactly two reasons — the reader
 * paused long enough to mean one (`pause`, decided in lib/useVoiceSearch.ts),
 * or one of the two sides is not Thai, because Latin words spoken into a Thai
 * note still need separating from what is around them.
 */
const THAI_LETTER = /[\u0E00-\u0E7F]/;

function spokenSeparator(precedingChar: string, text: string, pause: boolean): string {
  if (!precedingChar) return ""; // start of a paragraph
  if (/\s/.test(precedingChar)) return ""; // there is already a space there
  if (pause) return " ";
  const first = text[0] ?? "";
  return THAI_LETTER.test(precedingChar) && THAI_LETTER.test(first) ? "" : " ";
}

/**
 * Drops a dictated phrase in at the caret as plain text — never as HTML, so
 * nothing spoken can turn into markup.
 */
function insertSpokenText(editor: Editor, text: string, pause: boolean) {
  const { $from } = editor.state.selection;
  const precedingChar =
    $from.parentOffset > 0 ? $from.parent.textBetween($from.parentOffset - 1, $from.parentOffset) : "";
  const separator = spokenSeparator(precedingChar, text, pause);
  editor
    .chain()
    .focus()
    .insertContent([{ type: "text", text: `${separator}${text}` }])
    .run();
}

function ToolButton({
  onClick,
  active = false,
  disabled = false,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      // The toolbar must never steal the selection it is about to act on:
      // pressing a button with the caret in the document keeps that caret.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`inline-flex items-center justify-center h-8 min-w-[2rem] px-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active ? "bg-navy-950 text-gold-400" : "text-navy-800 hover:bg-navy-900/[0.07]"
      }`}
    >
      {children}
    </button>
  );
}

function Popover({
  title,
  children,
  trigger,
  panelClassName = "",
}: {
  title: string;
  trigger: ReactNode;
  panelClassName?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocumentDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocumentDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDocumentDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        title={title}
        aria-label={title}
        aria-expanded={open}
        className={`inline-flex items-center gap-0.5 h-8 px-1.5 rounded-lg transition-colors ${
          open ? "bg-navy-950 text-gold-400" : "text-navy-800 hover:bg-navy-900/[0.07]"
        }`}
      >
        {trigger}
        <IconChevronDown width={13} height={13} className="shrink-0 opacity-70" />
      </button>
      {open && (
        <div
          className={`absolute z-20 mt-1 left-0 bg-white border border-navy-900/10 rounded-xl shadow-card p-2 ${panelClassName}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 rounded-lg text-sm text-navy-800 hover:bg-gold-400/10 whitespace-nowrap"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="w-px h-6 bg-navy-900/10 mx-0.5 self-center" />;
}

function blockLabel(editor: Editor): string {
  if (editor.isActive("heading", { level: 1 })) return "หัวข้อ 1";
  if (editor.isActive("heading", { level: 2 })) return "หัวข้อ 2";
  if (editor.isActive("heading", { level: 3 })) return "หัวข้อ 3";
  if (editor.isActive("heading", { level: 4 })) return "หัวข้อ 4";
  if (editor.isActive("codeBlock")) return "โค้ด";
  if (editor.isActive("blockquote")) return "คำพูด";
  return "ข้อความปกติ";
}

/**
 * Whether the toolbar starts folded away, remembered per browser.
 *
 * Somebody reading back a long page wants the page and nothing else, and that
 * preference outlives the visit — re-folding the toolbar on every note would
 * make the button useless to the person who wanted it most. Wrapped because
 * storage throws outright in a private window rather than returning nothing.
 */
const TOOLBAR_HIDDEN_KEY = "note-toolbar-hidden";

function readToolbarHidden(): boolean {
  try {
    return localStorage.getItem(TOOLBAR_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function Toolbar({ editor, fontFamilies, onManageFonts }: { editor: Editor; fontFamilies: string[]; onManageFonts?: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [linkValue, setLinkValue] = useState("");
  const [hidden, setHidden] = useState(readToolbarHidden);

  useEffect(() => {
    try {
      localStorage.setItem(TOOLBAR_HIDDEN_KEY, hidden ? "1" : "0");
    } catch {
      // A browser that refuses storage still gets the toggle, just not the memory.
    }
  }, [hidden]);

  async function onPickImage(file: File | undefined) {
    if (!file) return;
    setImageError(null);
    try {
      const src = await fileToInlineImage(file);
      editor.chain().focus().setImage({ src }).run();
    } catch {
      setImageError("เปิดรูปนี้ไม่ได้ ลองไฟล์ JPG หรือ PNG");
    }
  }

  const inTable = editor.isActive("table");

  // Folded away: one small button and an otherwise clear page.
  if (hidden) {
    return (
      <div className="sticky top-[3.75rem] z-10 -mx-1 px-1 py-1 bg-ivory/95 backdrop-blur border-b border-navy-900/[0.06] flex justify-end">
        <ToolButton title="แสดงแถบเครื่องมือ" onClick={() => setHidden(false)}>
          <IconChevronsDown width={18} height={18} />
        </ToolButton>
      </div>
    );
  }

  return (
    <div className="sticky top-[3.75rem] z-10 -mx-1 px-1 py-1.5 bg-ivory/95 backdrop-blur border-b border-navy-900/10">
      <div className="flex flex-wrap items-center gap-0.5">
        <ToolButton title="ย้อนกลับ (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <IconUndo width={18} height={18} />
        </ToolButton>
        <ToolButton title="ทำซ้ำ (Ctrl+Shift+Z)" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <IconRedo width={18} height={18} />
        </ToolButton>

        {/* Dictation sits with undo/redo rather than among the formatting
            marks: it is a way of putting words in, not a way of styling them.
            Every settled phrase is inserted as plain text at the caret — never
            as HTML, so nothing spoken can become markup. */}
        <DictationButton onText={(text, pause) => insertSpokenText(editor, text, pause)} />

        {/* Proofreading belongs here for the same reason: it is about the
            words, not their appearance. */}
        <ProofreadButton editor={editor} />

        <Divider />

        <Popover title="รูปแบบย่อหน้า" panelClassName="w-44" trigger={<span className="text-sm px-1 font-medium">{blockLabel(editor)}</span>}>
          {(close) => (
            <div className="space-y-0.5">
              <MenuItem
                onClick={() => {
                  editor.chain().focus().setParagraph().run();
                  close();
                }}
              >
                ข้อความปกติ
              </MenuItem>
              {([1, 2, 3, 4] as const).map((level) => (
                <MenuItem
                  key={level}
                  onClick={() => {
                    editor.chain().focus().toggleHeading({ level }).run();
                    close();
                  }}
                >
                  <span className={level === 1 ? "text-xl font-serif font-semibold" : level === 2 ? "text-lg font-serif font-semibold" : "font-semibold"}>
                    หัวข้อ {level}
                  </span>
                </MenuItem>
              ))}
              <MenuItem
                onClick={() => {
                  editor.chain().focus().toggleBlockquote().run();
                  close();
                }}
              >
                คำพูด / อ้างอิง
              </MenuItem>
              <MenuItem
                onClick={() => {
                  editor.chain().focus().toggleCodeBlock().run();
                  close();
                }}
              >
                บล็อกโค้ด
              </MenuItem>
            </div>
          )}
        </Popover>

        <Popover title="ฟอนต์" trigger={<IconFont width={18} height={18} />} panelClassName="w-56">
          {(close) => (
            <div className="space-y-0.5 max-h-72 overflow-y-auto">
              {BUILT_IN_FONTS.map((font) => (
                <MenuItem
                  key={font.label}
                  onClick={() => {
                    if (font.value) editor.chain().focus().setFontFamily(font.value).run();
                    else editor.chain().focus().unsetFontFamily().run();
                    close();
                  }}
                >
                  <span style={font.value ? { fontFamily: `"${font.value}"` } : undefined}>{font.label}</span>
                </MenuItem>
              ))}
              {fontFamilies.length > 0 && (
                <div className="pt-1 mt-1 border-t border-navy-900/10">
                  <p className="px-3 py-1 text-[11px] uppercase tracking-wide text-navy-700/45">ฟอนต์ของฉัน</p>
                  {fontFamilies.map((family) => (
                    <MenuItem
                      key={family}
                      onClick={() => {
                        editor.chain().focus().setFontFamily(family).run();
                        close();
                      }}
                    >
                      <span style={{ fontFamily: `"${family}"` }}>{family}</span>
                    </MenuItem>
                  ))}
                </div>
              )}
              {onManageFonts && (
                <div className="pt-1 mt-1 border-t border-navy-900/10">
                  <MenuItem
                    onClick={() => {
                      onManageFonts();
                      close();
                    }}
                  >
                    <span className="text-gold-600">＋ อัปโหลดฟอนต์ของฉัน…</span>
                  </MenuItem>
                </div>
              )}
            </div>
          )}
        </Popover>

        <Popover title="ขนาดตัวอักษร" trigger={<IconTextSize width={18} height={18} />} panelClassName="w-36">
          {(close) => (
            <div className="space-y-0.5">
              {FONT_SIZES.map((size) => (
                <MenuItem
                  key={size.label}
                  onClick={() => {
                    if (size.value) editor.chain().focus().setFontSize(size.value).run();
                    else editor.chain().focus().unsetFontSize().run();
                    close();
                  }}
                >
                  <span style={size.value ? { fontSize: size.value } : undefined}>{size.label}</span>
                </MenuItem>
              ))}
            </div>
          )}
        </Popover>

        <Divider />

        <ToolButton title="ตัวหนา (Ctrl+B)" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <IconBold width={18} height={18} />
        </ToolButton>
        <ToolButton title="ตัวเอียง (Ctrl+I)" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <IconItalic width={18} height={18} />
        </ToolButton>
        <ToolButton title="ขีดเส้นใต้ (Ctrl+U)" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <IconUnderline width={18} height={18} />
        </ToolButton>
        <ToolButton title="ขีดฆ่า" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <IconStrikethrough width={18} height={18} />
        </ToolButton>
        <ToolButton title="โค้ดในบรรทัด" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
          <IconCode width={18} height={18} />
        </ToolButton>

        <Popover title="สีตัวอักษร" trigger={<IconPalette width={18} height={18} />} panelClassName="w-44">
          {(close) => (
            <div>
              <div className="grid grid-cols-4 gap-1.5 p-1">
                {TEXT_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    title={color.label}
                    aria-label={`สีตัวอักษร ${color.label}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      editor.chain().focus().setColor(color.value).run();
                      close();
                    }}
                    className="w-7 h-7 rounded-lg border border-navy-900/10 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color.value }}
                  />
                ))}
              </div>
              <MenuItem
                onClick={() => {
                  editor.chain().focus().unsetColor().run();
                  close();
                }}
              >
                คืนค่าสีเดิม
              </MenuItem>
            </div>
          )}
        </Popover>

        <Popover title="ไฮไลต์" trigger={<IconHighlighter width={18} height={18} />} panelClassName="w-44">
          {(close) => (
            <div>
              <div className="grid grid-cols-4 gap-1.5 p-1">
                {HIGHLIGHT_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    title={color.label}
                    aria-label={`ไฮไลต์สี ${color.label}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      editor.chain().focus().toggleHighlight({ color: color.value }).run();
                      close();
                    }}
                    className="w-7 h-7 rounded-lg border border-navy-900/10 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color.value }}
                  />
                ))}
              </div>
              <MenuItem
                onClick={() => {
                  editor.chain().focus().unsetHighlight().run();
                  close();
                }}
              >
                เอาไฮไลต์ออก
              </MenuItem>
            </div>
          )}
        </Popover>

        <ToolButton
          title="ล้างรูปแบบทั้งหมด"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        >
          <IconEraser width={18} height={18} />
        </ToolButton>

        <Divider />

        <ToolButton title="หัวข้อย่อย" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <IconListBullet width={18} height={18} />
        </ToolButton>
        <ToolButton title="ลำดับตัวเลข" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <IconListOrdered width={18} height={18} />
        </ToolButton>
        <ToolButton title="รายการติ๊กถูก" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <IconListTask width={18} height={18} />
        </ToolButton>
        <ToolButton
          title="เพิ่มระดับย่อย (Tab)"
          onClick={() => {
            const type = editor.isActive("taskItem") ? "taskItem" : "listItem";
            editor.chain().focus().sinkListItem(type).run();
          }}
          disabled={!editor.can().sinkListItem(editor.isActive("taskItem") ? "taskItem" : "listItem")}
        >
          <IconIndent width={18} height={18} />
        </ToolButton>
        <ToolButton
          title="ลดระดับย่อย (Shift+Tab)"
          onClick={() => {
            const type = editor.isActive("taskItem") ? "taskItem" : "listItem";
            editor.chain().focus().liftListItem(type).run();
          }}
          disabled={!editor.can().liftListItem(editor.isActive("taskItem") ? "taskItem" : "listItem")}
        >
          <IconOutdent width={18} height={18} />
        </ToolButton>

        <Divider />

        <ToolButton title="ชิดซ้าย" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          <IconAlignLeft width={18} height={18} />
        </ToolButton>
        <ToolButton title="กึ่งกลาง" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          <IconAlignCenter width={18} height={18} />
        </ToolButton>
        <ToolButton title="ชิดขวา" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          <IconAlignRight width={18} height={18} />
        </ToolButton>
        <ToolButton
          title="เต็มบรรทัด"
          active={editor.isActive({ textAlign: "justify" })}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        >
          <IconAlignJustify width={18} height={18} />
        </ToolButton>

        <Divider />

        <ToolButton title="คำพูด / อ้างอิง" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <IconQuote width={18} height={18} />
        </ToolButton>
        <ToolButton title="บล็อกโค้ด" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <IconCodeBlock width={18} height={18} />
        </ToolButton>
        <ToolButton title="เส้นคั่น" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <IconHorizontalRule width={18} height={18} />
        </ToolButton>

        <Popover
          title="ใส่ลิงก์"
          trigger={<IconLink width={18} height={18} />}
          panelClassName="w-72"
        >
          {(close) => (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-navy-800" htmlFor="note-link-url">
                ที่อยู่ลิงก์
              </label>
              <input
                id="note-link-url"
                autoFocus
                defaultValue={editor.getAttributes("link").href ?? ""}
                onChange={(e) => setLinkValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const href = (e.target as HTMLInputElement).value.trim();
                  if (href) editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
                  close();
                }}
                placeholder="https://"
                className="input-field text-sm py-2"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const href = (linkValue || editor.getAttributes("link").href || "").trim();
                    if (href) editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
                    close();
                  }}
                  className="btn-primary text-sm py-1.5 px-3"
                >
                  ใส่ลิงก์
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().extendMarkRange("link").unsetLink().run();
                    close();
                  }}
                  className="btn-outline text-sm py-1.5 px-3 inline-flex items-center gap-1.5"
                >
                  <IconUnlink width={15} height={15} /> เอาออก
                </button>
              </div>
            </div>
          )}
        </Popover>

        <ToolButton title="แทรกรูปภาพ" onClick={() => fileInput.current?.click()}>
          <IconImage width={18} height={18} />
        </ToolButton>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void onPickImage(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        <Popover title="ตาราง" trigger={<IconTable width={18} height={18} />} panelClassName="w-52">
          {(close) => (
            <div className="space-y-0.5">
              <MenuItem
                onClick={() => {
                  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                  close();
                }}
              >
                แทรกตาราง 3×3
              </MenuItem>
              {inTable && (
                <>
                  <MenuItem onClick={() => editor.chain().focus().addRowAfter().run()}>เพิ่มแถวด้านล่าง</MenuItem>
                  <MenuItem onClick={() => editor.chain().focus().addColumnAfter().run()}>เพิ่มคอลัมน์ด้านขวา</MenuItem>
                  <MenuItem onClick={() => editor.chain().focus().deleteRow().run()}>ลบแถวนี้</MenuItem>
                  <MenuItem onClick={() => editor.chain().focus().deleteColumn().run()}>ลบคอลัมน์นี้</MenuItem>
                  <MenuItem onClick={() => editor.chain().focus().mergeOrSplit().run()}>รวม / แยกช่อง</MenuItem>
                  <MenuItem onClick={() => editor.chain().focus().toggleHeaderRow().run()}>สลับแถวหัวตาราง</MenuItem>
                  <MenuItem
                    onClick={() => {
                      editor.chain().focus().deleteTable().run();
                      close();
                    }}
                  >
                    <span className="text-red-700 inline-flex items-center gap-1.5">
                      <IconTrash width={14} height={14} /> ลบตาราง
                    </span>
                  </MenuItem>
                </>
              )}
            </div>
          )}
        </Popover>

        {/* Last, and pushed to the far end of the last row: the way out of the
            toolbar for somebody who wants to read their page, not edit it. */}
        <span className="ml-auto">
          <ToolButton title="ซ่อนแถบเครื่องมือทั้งหมด" onClick={() => setHidden(true)}>
            <IconChevronsUp width={18} height={18} />
          </ToolButton>
        </span>
      </div>
      {imageError && <p className="text-red-700 text-xs px-1 pt-1">{imageError}</p>}
    </div>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "เริ่มเขียนที่นี่… พิมพ์ # แล้วเว้นวรรคเพื่อทำหัวข้อ, - เพื่อทำรายการ",
  contentClassName = "min-h-[55vh]",
  editable = true,
  fontFamilies = [],
  onManageFonts,
}: RichTextEditorProps) {
  const editor = useEditor({
    editable,
    // Toolbar states (which button is lit, what the block dropdown says)
    // follow the caret, so the toolbar has to re-render as the selection
    // moves — not only when the text changes.
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TextStyleKit,
      Highlight.configure({ multicolor: true }),
      Image.configure({ inline: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TableKit.configure({ table: { resizable: true } }),
      Placeholder.configure({ placeholder }),
      CharacterCount,
      ProofreadHighlight,
    ],
    content: value,
    // Only when the document itself changed. Tiptap also fires onUpdate for
    // transactions that carry no steps — moving the caret, the editor
    // settling after it parses the initial HTML — and treating those as edits
    // marked a page "ยังไม่ได้บันทึก" the moment it was opened, then wrote it
    // straight back to the database without anybody typing a thing.
    onUpdate: ({ editor: instance, transaction }) => {
      if (!transaction.docChanged) return;
      onChange(instance.getHTML());
    },
    editorProps: {
      attributes: {
        class: `note-content ${contentClassName} focus:outline-none`,
      },
    },
  });

  // Content replaced from outside while the editor is open — an import
  // landing in the page being edited, or a save from another device
  // refetching. Never while the caret is in the document: overwriting what
  // someone is in the middle of typing is worse than being briefly stale.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    if (value === editor.getHTML()) return;
    editor.commands.setContent(value || "", { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  if (!editor) return null;

  return (
    <div className="flex flex-col">
      {editable && <Toolbar editor={editor} fontFamilies={fontFamilies} onManageFonts={onManageFonts} />}
      <EditorContent editor={editor} className="flex-1 overflow-y-auto pt-3" />
      {editable && (
        <div className="pt-2 text-xs text-navy-700/50 border-t border-navy-900/[0.06] mt-2">
          {editor.storage.characterCount.words()} คำ · {editor.storage.characterCount.characters()} ตัวอักษร
        </div>
      )}
    </div>
  );
}
