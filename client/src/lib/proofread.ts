import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import type { ProofreadFix } from "../../../server/src/domain/proofread";

export type { ProofreadFix };

/**
 * Showing a proofreading pass inside the editor: the words to look at, and
 * then the words that were changed.
 *
 * The marks are ProseMirror **decorations**, not marks in the document. That
 * is the whole reason this file exists rather than reusing the highlighter in
 * the toolbar. A decoration is drawn by the editor view and lives nowhere
 * else: it is not in the HTML, so it cannot be saved to the note, cannot
 * survive into what the server sanitizes and stores, cannot be exported into
 * a document, and cannot be left behind for the reader to clean up. Marking
 * mistakes with real highlight marks would put the proofreader's opinion into
 * the reader's own page, where it would still be sitting a year later.
 *
 * Decorations also move on their own. They are mapped through every edit, so
 * a highlight stays on its word while the reader types above it.
 */

const proofreadKey = new PluginKey<ProofreadState>("proofread");

type ProofreadMeta = {
  decorations: Decoration[];
  /**
   * True for the green "this is what I just changed" marks. They describe one
   * action rather than the text itself, so the next change to the document —
   * an undo of the fix above all — ends them. Without this an undo leaves the
   * green marks sitting on the restored words, claiming a change that is no
   * longer there. The red marks are not volatile: they belong to the words,
   * and survive the reader typing around them while reading the list.
   */
  volatile: boolean;
};

type ProofreadState = { decorations: DecorationSet; volatile: boolean };

const EMPTY: ProofreadState = { decorations: DecorationSet.empty, volatile: false };

export const ProofreadHighlight = Extension.create({
  name: "proofreadHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin<ProofreadState>({
        key: proofreadKey,
        state: {
          init: () => EMPTY,
          apply(tr, current) {
            const meta = tr.getMeta(proofreadKey) as ProofreadMeta | undefined;
            if (meta) {
              if (!meta.decorations.length) return EMPTY;
              return { decorations: DecorationSet.create(tr.doc, meta.decorations), volatile: meta.volatile };
            }
            if (tr.docChanged && current.volatile) return EMPTY;
            // Not a proofreading transaction — carry the highlights across
            // whatever else was edited.
            return { ...current, decorations: current.decorations.map(tr.mapping, tr.doc) };
          },
        },
        props: {
          decorations(state) {
            return proofreadKey.getState(state)?.decorations;
          },
        },
      }),
    ];
  },
});

export interface FixRange {
  from: number;
  to: number;
  fix: ProofreadFix;
}

/**
 * Every place in the document where one of these fixes applies.
 *
 * Matching happens inside a single text node at a time, which is the honest
 * limit of this approach: a word with a bold letter in the middle of it is
 * two text nodes and will not be found. That is a fair trade for never
 * mis-counting a position — a wrong position here would put a replacement in
 * the wrong place in somebody's page.
 *
 * Overlaps are dropped, keeping the earlier match, because two replacements
 * over the same characters cannot both be carried out.
 */
export function findFixRanges(doc: ProseMirrorNode, fixes: ProofreadFix[]): FixRange[] {
  const found: FixRange[] = [];

  doc.descendants((node, pos) => {
    const text = node.isText ? node.text : null;
    if (!text) return;
    for (const fix of fixes) {
      if (!fix.wrong) continue;
      let index = text.indexOf(fix.wrong);
      while (index !== -1) {
        found.push({ from: pos + index, to: pos + index + fix.wrong.length, fix });
        index = text.indexOf(fix.wrong, index + fix.wrong.length);
      }
    }
  });

  found.sort((a, b) => a.from - b.from);

  const ranges: FixRange[] = [];
  let end = -1;
  for (const range of found) {
    if (range.from < end || range.to <= range.from) continue;
    ranges.push(range);
    end = range.to;
  }
  return ranges;
}

function label(fix: ProofreadFix): string {
  const right = fix.right || "(ลบออก)";
  return fix.reason ? `${fix.wrong} → ${right} · ${fix.reason}` : `${fix.wrong} → ${right}`;
}

function setDecorations(editor: Editor, decorations: Decoration[], volatile = false): void {
  const { view } = editor;
  // A transaction with no steps: the document is untouched, so the note does
  // not become unsaved just because it was checked.
  view.dispatch(view.state.tr.setMeta(proofreadKey, { decorations, volatile } satisfies ProofreadMeta));
}

/** Marks every place a fix applies, and reports how many there were. */
export function highlightIssues(editor: Editor, fixes: ProofreadFix[]): number {
  const ranges = findFixRanges(editor.state.doc, fixes);
  setDecorations(
    editor,
    ranges.map((range) => Decoration.inline(range.from, range.to, { class: "proofread-issue", title: label(range.fix) })),
  );
  return ranges.length;
}

export function clearHighlights(editor: Editor): void {
  setDecorations(editor, []);
}

/** Puts the caret on the first place a fix applies and scrolls it into view. */
export function revealFix(editor: Editor, fix: ProofreadFix): boolean {
  const [range] = findFixRanges(editor.state.doc, [fix]);
  if (!range) return false;
  editor.chain().focus().setTextSelection({ from: range.from, to: range.to }).scrollIntoView().run();
  return true;
}

/**
 * Carries out the given fixes and leaves the changed words highlighted.
 *
 * Positions are looked up again here rather than reused from the check: the
 * reader may have typed since, and a stale position would land a replacement
 * in the middle of a different word. Replacements run front to back in one
 * transaction — one undo takes the whole pass back — with a running offset,
 * since each one shifts everything after it.
 */
export function applyFixes(editor: Editor, fixes: ProofreadFix[]): number {
  const ranges = findFixRanges(editor.state.doc, fixes);
  if (ranges.length === 0) {
    clearHighlights(editor);
    return 0;
  }

  const { view } = editor;
  const tr = view.state.tr;
  const changed: Decoration[] = [];
  let offset = 0;

  for (const range of ranges) {
    const from = range.from + offset;
    const to = range.to + offset;
    const replacement = range.fix.right;
    if (replacement) tr.insertText(replacement, from, to);
    else tr.delete(from, to);
    if (replacement) {
      changed.push(
        Decoration.inline(from, from + replacement.length, {
          class: "proofread-fixed",
          title: `แก้จาก "${range.fix.wrong}"`,
        }),
      );
    }
    offset += replacement.length - (range.to - range.from);
  }

  // The same transaction that makes the changes carries the highlights, so
  // the positions cannot drift between the two.
  tr.setMeta(proofreadKey, { decorations: changed, volatile: true } satisfies ProofreadMeta);
  view.dispatch(tr);
  return ranges.length;
}
