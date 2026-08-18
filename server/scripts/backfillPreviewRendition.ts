/**
 * One-time backfill: generates the fast-loading preview rendition (see
 * services/compressPdfBuffer.ts) for PDF files uploaded before that feature
 * existed, so they benefit immediately without needing to be re-uploaded.
 *
 * Usage: npx tsx scripts/backfillPreviewRendition.ts
 */
import "../src/env";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db/client";
import { libraryFiles } from "../src/db/schema";
import { storageAdapter } from "../src/storage/index";
import { compressPdfBuffer } from "../src/services/compressPdfBuffer";

const PREVIEW_WORTHY_MIN_BYTES = 5 * 1024 * 1024;

async function main() {
  const files = await db
    .select()
    .from(libraryFiles)
    .where(and(eq(libraryFiles.mimeType, "application/pdf"), isNull(libraryFiles.previewStorageKey)));

  const worthIt = files.filter((f) => f.size > PREVIEW_WORTHY_MIN_BYTES);
  console.log(`Found ${files.length} PDF(s) without a preview rendition, ${worthIt.length} large enough to be worth it.`);

  for (const file of worthIt) {
    console.log(`  ${file.title} (${(file.size / 1024 / 1024).toFixed(2)} MB)...`);
    const original = await storageAdapter.get(file.storageKey);
    const { bytes, scanPages, copiedPages } = await compressPdfBuffer(original, { quality: 80, maxDimension: 1800 });
    console.log(`    ${scanPages} page(s) recompressed, ${copiedPages} copied as-is`);
    if (bytes.byteLength >= original.byteLength) {
      console.log(`    skipped: rendition (${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB) not smaller than original`);
      continue;
    }
    const key = `${file.storageKey}.preview.pdf`;
    await storageAdapter.put(key, bytes, "application/pdf");
    await db.update(libraryFiles).set({ previewStorageKey: key, updatedAt: new Date() }).where(eq(libraryFiles.id, file.id));
    const reduction = (1 - bytes.byteLength / original.byteLength) * 100;
    console.log(`    done: ${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB (${reduction.toFixed(0)}% smaller)`);
  }

  console.log("Backfill complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
