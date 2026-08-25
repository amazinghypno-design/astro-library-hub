import { IconEraser, IconHighlighter, IconPen, IconRuler } from "../components/icons";
import type { IconProps } from "../components/icons";
import type { DrawToolId } from "./readingProgress";

/**
 * The stationery both readers offer, defined once so a PDF and a Word document
 * are annotated with the same four tools, the same colours and the same
 * stroke weights rather than two sets that drift apart.
 */
export const PEN_COLORS = ["#1a1a2e", "#dc2626", "#2563eb", "#16a34a"];
export const HIGHLIGHTER_COLORS = ["#facc15", "#f472b6", "#4ade80", "#60a5fa"];

export const paletteFor = (tool: DrawToolId) => (tool === "highlighter" ? HIGHLIGHTER_COLORS : PEN_COLORS);

// Fraction of the page's own width — not pixels — so a stroke stays the right
// relative thickness at any zoom level or screen size. The ruler lays down the
// same line the pen does, only held straight.
export const TOOL_WIDTH: Record<Exclude<DrawToolId, "eraser">, number> = { pen: 0.0035, ruler: 0.0035, highlighter: 0.014 };

export const strokeWidthFor = (tool: DrawToolId) => (tool === "eraser" ? 0 : TOOL_WIDTH[tool]);

export const DRAW_TOOLS: { id: DrawToolId; label: string; Icon: (props: IconProps) => JSX.Element; hint: string }[] = [
  { id: "pen", label: "ปากกา", Icon: IconPen, hint: "เขียนอิสระ" },
  { id: "highlighter", label: "ปากกาเน้น", Icon: IconHighlighter, hint: "ระบายเน้นข้อความ" },
  { id: "ruler", label: "ไม้บรรทัด", Icon: IconRuler, hint: "ลากแล้วได้เส้นตรงเสมอ ไม่ว่ามือจะสั่นแค่ไหน" },
  { id: "eraser", label: "ยางลบ", Icon: IconEraser, hint: "ลากผ่านเส้นที่เขียนไว้เพื่อลบทั้งเส้น" },
];
