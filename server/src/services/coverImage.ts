import sharp from "sharp";
import { storageAdapter } from "../storage/index";

/**
 * Cover images live beside the files they belong to, keyed by file id rather
 * than by the document's storage key: a cover is regenerated far more often
 * than a file is replaced, and one predictable key per file means a
 * regeneration overwrites the old cover instead of leaking an orphan object
 * into the bucket every time.
 */
export const COVER_CONTENT_TYPE = "image/webp";

/** Generous next to a ~40KB WebP — this exists to stop something absurd, not to trim quality. */
const MAX_INPUT_BYTES = 3 * 1024 * 1024;

const COVER_MAX_WIDTH = 600;
const COVER_MAX_HEIGHT = 1020;

export function coverKeyFor(fileId: string): string {
  return `covers/${fileId}.webp`;
}

/**
 * Re-encodes through sharp rather than storing what the browser sent.
 *
 * The bytes arrive as base64 from a client, and only an admin can get here —
 * but "only an admin" is not the same as "safe to serve back to every visitor
 * under an image content type". Decoding and re-encoding means what lands in
 * the bucket is an image sharp itself produced: nothing else survives the
 * round trip, and anything that isn't a real image throws here instead of
 * being stored.
 */
export async function storeCover(fileId: string, imageBase64: string): Promise<string> {
  const raw = Buffer.from(imageBase64, "base64");
  if (raw.byteLength === 0 || raw.byteLength > MAX_INPUT_BYTES) {
    throw new Error("COVER_SIZE_INVALID");
  }

  const bytes = await sharp(raw)
    .resize({ width: COVER_MAX_WIDTH, height: COVER_MAX_HEIGHT, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const key = coverKeyFor(fileId);
  await storageAdapter.put(key, bytes, COVER_CONTENT_TYPE);
  return key;
}
