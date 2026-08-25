import os from "node:os";
import path from "node:path";
import { createWorker, type Worker } from "tesseract.js";
import "../env";
import type { OcrAdapter } from "./types";

/**
 * Tesseract, in WebAssembly, inside this process — no OCR account, no API key,
 * no per-page bill, which is what makes it the right default for a library
 * that is one person's collection.
 *
 * The trade is accuracy. Tesseract reads Thai consonants well but drops tone
 * marks and vowels often enough to notice: "แก้กำลัง" comes back as "แกกาลง"
 * (measured on this library's own posters — confidence ~88). That is a poor
 * transcript and a perfectly good search index: the words are still findable
 * and the passage still means something to the Q&A model. If exact Thai
 * transcription ever matters, a cloud OCR (Google Vision, Azure) reads Thai
 * markedly better — write it as a second OcrAdapter and point OCR_PROVIDER at
 * it; nothing else in the app has to change.
 */

/** "tha+eng": Thai books carry English terms, page numbers and roman numerals throughout. */
const LANGS = process.env.OCR_LANGS ?? "tha+eng";

/**
 * Where the ~15MB of language data is cached. Downloaded once on first use and
 * reused after; on a host with an ephemeral disk it simply downloads again
 * after a deploy, which costs one slow first page and nothing else.
 */
const CACHE_PATH = process.env.OCR_CACHE_PATH ?? path.join(os.tmpdir(), "astro-hub-tessdata");

/**
 * Started on the first page that needs it, not at import: most uploads are
 * born with a text layer and never reach OCR at all, and a worker that is
 * never used should cost nothing. Kept alive between pages of the same book —
 * spinning one up costs about half a second, which would otherwise be paid
 * once per page.
 */
let worker: Worker | null = null;
let starting: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (worker) return worker;
  // Two pages asking at once must not start two engines; they wait on one promise.
  starting ??= createWorker(LANGS, undefined, { cachePath: CACHE_PATH }).then((w) => {
    worker = w;
    starting = null;
    return w;
  });
  return starting;
}

export const tesseractOcrAdapter: OcrAdapter = {
  async recognizeImage(image) {
    const engine = await getWorker();
    const { data } = await engine.recognize(image);
    return data.text.trim();
  },

  async shutdown() {
    const engine = worker ?? (starting ? await starting : null);
    worker = null;
    starting = null;
    await engine?.terminate();
  },
};
