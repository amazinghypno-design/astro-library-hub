/**
 * Hands a captured page image to the reader — the share sheet on phones (so it
 * can go straight into LINE/Messenger, which is what people actually do with a
 * page of a book), and a plain download everywhere else.
 *
 * Shared by the PDF reader and the Office document reader so a captured page
 * behaves identically whichever kind of file it came from.
 */
export async function shareOrSaveImage(blob: Blob, fileName: string, shareTitle: string, shareText: string): Promise<void> {
  const shareFile = new File([blob], fileName, { type: "image/png" });

  if (navigator.canShare?.({ files: [shareFile] })) {
    try {
      await navigator.share({ files: [shareFile], title: shareTitle, text: shareText });
      return;
    } catch (err) {
      // A cancelled share sheet is a decision, not a failure — don't then
      // shove a download at someone who just backed out.
      if (err instanceof Error && err.name === "AbortError") return;
      // Anything else: fall through and save the file instead.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Strips characters that are illegal in filenames on Windows/macOS. */
export function safeFileName(name: string, fallback: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "").trim();
  return cleaned || fallback;
}
