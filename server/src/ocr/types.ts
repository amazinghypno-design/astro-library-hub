export interface OcrAdapter {
  /** Reads whatever text is in one raster image. Returns "" when there is none to find. */
  recognizeImage(image: Buffer): Promise<string>;
  /**
   * Releases whatever the engine holds open. Safe to call when nothing was
   * ever recognized, and safe to call more than once — the caller runs it in a
   * `finally`, which fires on the paths where no page was reached at all.
   */
  shutdown(): Promise<void>;
}
