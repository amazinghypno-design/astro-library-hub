import { IconExpand } from "./icons";

/**
 * Shown above a landscape document on a touch device before the reader has
 * gone fullscreen.
 *
 * A wide page laid out inside a portrait phone is technically fully visible
 * and practically unreadable — the text ends up a third of its natural size.
 * The fix already exists (fullscreen, then rotate), but nobody hunts for a
 * toolbar button to solve a problem they have not been told is solvable, so
 * this offers it at the moment the page looks too small.
 */
export default function LandscapeDocumentHint({ onOpenFullscreen }: { onOpenFullscreen: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-gold-400/10 border-b border-gold-500/20 text-sm">
      <span className="text-navy-800">เอกสารนี้เป็นแนวนอน</span>
      <button
        type="button"
        onClick={onOpenFullscreen}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-950 text-ivory font-medium hover:bg-navy-900 transition-colors"
      >
        <IconExpand width={15} height={15} /> ดูเต็มจอแนวนอน
      </button>
    </div>
  );
}
