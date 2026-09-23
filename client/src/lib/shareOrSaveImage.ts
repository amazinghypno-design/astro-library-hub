/**
 * Hands a captured page image to the reader.
 *
 * Shared by the PDF reader and the Office document reader so a captured page
 * behaves identically whichever kind of file it came from.
 *
 * **Why this is not simply `navigator.share` everywhere.** It used to be, and
 * on a desktop it produced the same picture twice. `navigator.share({files})`
 * in desktop Chrome stages the PNG in a temp folder and hands macOS a file;
 * choosing "Copy" then leaves a clipboard holding a *file reference* — a
 * file-url flavour plus the same path again as plain text. A chat composer
 * reads both, resolves each into an attachment, and one captured page arrives
 * as two identical images. (Verified from the live clipboard: `public.file-url`
 * 284 bytes and `public.utf8-plain-text` 183 bytes, both naming the one staged
 * file under `Chrome/Default/WebShare/share-…/`.)
 *
 * So the delivery is chosen by what the device is actually for:
 *
 * - **Touch devices** get the share sheet, because "send this page to someone
 *   in LINE" is the whole point on a phone, and a phone share hands the target
 *   app the file itself rather than a path to it. The payload is the file and
 *   nothing else — a `title`/`text` alongside it is one more item for the
 *   receiving app to materialise, which is the same duplicate by another road.
 * - **Everything else** gets the image *itself* on the clipboard, as image
 *   bytes rather than as a reference to a file. That is one clipboard item, so
 *   there is nothing for a composer to attach twice, and it is what "แคปแล้ว
 *   วาง" means on a desktop anyway.
 * - **If the clipboard refuses** (Safari is strict about writing to it once a
 *   user gesture has expired, which `canvas.toBlob` is long enough to do), the
 *   PNG downloads, which always works.
 */
export type ImageDelivery = "copied" | "shared" | "cancelled" | "downloaded";

/** True where the share sheet is the right destination — a phone, not a desk. */
export function prefersShareSheet(): boolean {
  return navigator.maxTouchPoints > 0 && !!navigator.canShare;
}

/**
 * Puts the image itself on the clipboard and says whether that worked. Used
 * when a capture should land on the clipboard without also offering to
 * download — the page is kept in the capture tray either way, so a failed
 * copy costs nothing and needs no fallback.
 */
export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

/** True while a share sheet or clipboard write from this module is in flight. */
let delivering = false;

export async function shareOrSaveImage(blob: Blob, fileName: string): Promise<ImageDelivery> {
  // A second capture while the first share sheet is still open would open a
  // second sheet, and on a phone both land in the same chat as two copies.
  // The button's `disabled` state is a render behind a fast double-tap; this
  // is not.
  if (delivering) return "cancelled";
  delivering = true;
  try {
    const shareFile = new File([blob], fileName, { type: "image/png" });

    if (navigator.maxTouchPoints > 0 && navigator.canShare?.({ files: [shareFile] })) {
      try {
        await navigator.share({ files: [shareFile] });
        return "shared";
      } catch (err) {
        // A cancelled share sheet is a decision, not a failure — don't then
        // shove a download at someone who just backed out.
        if (err instanceof Error && err.name === "AbortError") return "cancelled";
        // Anything else: fall through and save the file instead.
      }
    }

    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        return "copied";
      } catch {
        // Denied, or the gesture expired. Fall through.
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking in the same tick cancels the download in Safari, which reads
    // the URL after the click returns.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return "downloaded";
  } finally {
    delivering = false;
  }
}

/** Strips characters that are illegal in filenames on Windows/macOS. */
export function safeFileName(name: string, fallback: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "").trim();
  return cleaned || fallback;
}
