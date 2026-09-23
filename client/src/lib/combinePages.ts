import type { CapturedPage } from "./useCaptureTray";

/**
 * Stacks captured pages into one tall PNG.
 *
 * The clipboard holds exactly one image. That is an OS and browser rule, not
 * a choice we make: `navigator.clipboard.write` rejects an array of more than
 * one ClipboardItem in Chrome, and a paste yields one attachment whatever we
 * put there. So "give me all the pages in one go, to paste somewhere" has
 * exactly one honest answer on a desk — make the pages into a single image.
 *
 * Pages are scaled to a common width so a run of them reads as one strip
 * rather than a ragged column, and separated by a hairline so the eye can
 * tell where one page ends.
 */
const GAP = 24;
const RULE = "#d9d2c4";
const BACKGROUND = "#ffffff";

export async function combinePagesToPng(pages: CapturedPage[]): Promise<Blob> {
  if (pages.length === 0) throw new Error("NO_PAGES");

  const bitmaps = await Promise.all(pages.map((p) => createImageBitmap(p.blob)));
  try {
    const width = Math.max(...bitmaps.map((b) => b.width));
    const heights = bitmaps.map((b) => Math.round((b.height * width) / b.width));
    const height = heights.reduce((a, b) => a + b, 0) + GAP * (bitmaps.length - 1);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("CANVAS_CONTEXT_UNAVAILABLE");

    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, width, height);

    let y = 0;
    bitmaps.forEach((bitmap, i) => {
      ctx.drawImage(bitmap, 0, y, width, heights[i]);
      y += heights[i];
      if (i < bitmaps.length - 1) {
        // A rule down the middle of the gap, so two pages of similar text are
        // not mistaken for one continuous one.
        ctx.fillStyle = RULE;
        ctx.fillRect(0, y + GAP / 2, width, 1);
        y += GAP;
      }
    });

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("CANVAS_EXPORT_FAILED");
    return blob;
  } finally {
    for (const b of bitmaps) b.close();
  }
}

/**
 * Hands every page to the share sheet at once. Unlike the clipboard, a share
 * *can* carry several files, and the receiving app shows them as separate
 * images — which is what a phone should do with "send all of these".
 *
 * The payload is the files and nothing else: a title or text riding along is
 * one more item for the receiving app to materialise, which is how a single
 * capture once arrived in a chat as two identical images.
 */
export async function shareAllPages(pages: CapturedPage[]): Promise<"shared" | "cancelled" | "unsupported"> {
  const files = pages.map((p) => new File([p.blob], p.fileName, { type: "image/png" }));
  if (!navigator.canShare?.({ files })) return "unsupported";
  try {
    await navigator.share({ files });
    return "shared";
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return "cancelled";
    return "unsupported";
  }
}
