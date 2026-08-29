import { useEffect } from "react";
import { trpc } from "./trpc";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export interface NoteFont {
  id: string;
  family: string;
  originalName: string;
  format: string;
  size: number;
}

/**
 * Makes the owner's uploaded fonts real in the browser.
 *
 * A note stores only the family name (`font-family: บรรจง`), which is nothing
 * on its own — the face has to be declared. So the fonts the account owns are
 * fetched once and turned into @font-face rules pointing at `GET /font/:id`,
 * appended to the document head while the notebook is open and removed with
 * it. Everything downstream — the toolbar's font menu, the editor, and any
 * read-only render of the same HTML — then just works, because it is the same
 * mechanism a stylesheet would use.
 *
 * `font-display: swap` on purpose: a 400KB Thai face should never hold up the
 * text of a page the owner is trying to read, and the reflow when it arrives
 * is the honest trade.
 */
export function useNoteFonts(enabled: boolean): NoteFont[] {
  const fonts = trpc.fonts.list.useQuery(undefined, { enabled });
  const rows = fonts.data ?? [];
  // Serialized, so the effect re-runs when a font is added or removed but not
  // on every refetch that returns the same list.
  const signature = rows.map((font) => `${font.id}:${font.family}`).join("|");

  useEffect(() => {
    if (rows.length === 0) return;
    const style = document.createElement("style");
    style.setAttribute("data-note-fonts", "");
    style.textContent = rows
      .map(
        (font) =>
          `@font-face{font-family:"${font.family}";src:url("${API_BASE}/font/${font.id}") format("${font.format}");font-display:swap;}`,
      )
      .join("\n");
    document.head.appendChild(style);
    return () => style.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return rows;
}

export function fontFileUrl(fontId: string): string {
  return `${API_BASE}/font/${fontId}`;
}
