import "../env";
import type { OcrAdapter } from "./types";

const driver = process.env.OCR_PROVIDER ?? "tesseract";

/**
 * "none" is a real setting, not a placeholder: OCR is the most expensive thing
 * this server does, and on a small instance there has to be a way to turn it
 * off without redeploying different code. With it off every caller gets empty
 * text back, which is exactly what they got before OCR existed.
 */
const disabledOcrAdapter: OcrAdapter = {
  async recognizeImage() {
    return "";
  },
  async shutdown() {},
};

// Dynamic import (not a static one) so the ~5MB engine only loads when it is
// the active provider — mirrors server/src/storage/index.ts.
let ocrAdapter: OcrAdapter;
if (driver === "tesseract") {
  ocrAdapter = (await import("./tesseract")).tesseractOcrAdapter;
} else if (driver === "none") {
  ocrAdapter = disabledOcrAdapter;
} else {
  throw new Error(`Unknown OCR_PROVIDER: "${driver}" (expected "tesseract" or "none")`);
}

export const ocrEnabled = driver !== "none";
export { ocrAdapter };
