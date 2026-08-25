import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { libraryFiles } from "../src/db/schema";
import { storageAdapter } from "../src/storage/index";
import { isOcrableImage, isTextLayerThin } from "../src/domain/needsOcr";
import { ocrImage, ocrPdf } from "../src/services/ocrText";

/**
 * Runs OCR over files that are already in the library.
 *
 * New uploads get this automatically in postUploadProcessing; everything
 * uploaded before OCR existed does not, and that is most of this collection —
 * the poster set and the scanned books, which are exactly the files a reader
 * most wants to search and cannot.
 *
 *   npx tsx scripts/backfillOcr.ts                       # list what would be read, change nothing
 *   npx tsx scripts/backfillOcr.ts --write               # read them and save the text
 *   npx tsx scripts/backfillOcr.ts --write --id <uuid>   # one file, to try it first
 *   npx tsx scripts/backfillOcr.ts --write --limit 5     # a few at a time
 *   npx tsx scripts/backfillOcr.ts --write --max-mb 300  # include the giant scans too
 *
 * Safe to stop and re-run: it only ever fills in text that is missing, never
 * replaces text a file already has, and each file is committed as it finishes.
 */

function flag(name: string): string | null {
  const at = process.argv.indexOf(name);
  return at === -1 ? null : (process.argv[at + 1] ?? null);
}

const write = process.argv.includes("--write");
const idFilter = flag("--id");
const limit = Number(flag("--limit") ?? Infinity);

/**
 * The same ceiling postUploadProcessing applies, so a hand-run backfill cannot
 * quietly do what the automatic path refuses to. This library holds three
 * scans of 180-250MB; each is hours of OCR, so they are opt-in via --max-mb
 * rather than swept up by a plain run.
 */
const maxBytes = Number(flag("--max-mb") ?? 60) * 1024 * 1024;

async function main() {
  const all = await db
    .select({
      id: libraryFiles.id,
      title: libraryFiles.title,
      mimeType: libraryFiles.mimeType,
      storageKey: libraryFiles.storageKey,
      pageCount: libraryFiles.pageCount,
      extractedText: libraryFiles.extractedText,
      size: libraryFiles.size,
    })
    .from(libraryFiles);

  const untexted = all.filter((f) => {
    if (idFilter && f.id !== idFilter) return false;
    if (!isOcrableImage(f.mimeType) && f.mimeType !== "application/pdf") return false;
    return isTextLayerThin(f.extractedText, f.pageCount);
  });

  const tooBig = untexted.filter((f) => f.size > maxBytes);
  const candidates = untexted.filter((f) => f.size <= maxBytes).slice(0, limit);

  console.log(`${all.length} file(s) in the library, ${untexted.length} with no usable text.`);
  for (const f of tooBig) {
    console.log(`  skipping (${(f.size / 1024 / 1024).toFixed(0)}MB, over the ${(maxBytes / 1024 / 1024).toFixed(0)}MB cap): ${f.title}`);
  }
  if (!write) {
    for (const f of candidates) {
      console.log(`  would read: ${f.title} (${f.mimeType}, ${(f.size / 1024 / 1024).toFixed(1)}MB)`);
    }
    console.log("\nNothing was changed. Re-run with --write to actually read them.");
    return;
  }

  let filled = 0;
  for (const [index, file] of candidates.entries()) {
    const label = `[${index + 1}/${candidates.length}] ${file.title}`;
    const startedAt = Date.now();
    try {
      const bytes = await storageAdapter.get(file.storageKey);
      const result = isOcrableImage(file.mimeType) ? await ocrImage(bytes) : await ocrPdf(bytes);
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

      if (result.pagesRead === 0) {
        console.log(`${label}: nothing legible (${seconds}s)`);
        continue;
      }

      await db.update(libraryFiles).set({ extractedText: result.text }).where(eq(libraryFiles.id, file.id));
      filled++;
      const note = result.truncated ? ", stopped at the page cap" : "";
      console.log(`${label}: ${result.pagesRead} page(s), ${result.text.length} chars in ${seconds}s${note}`);
    } catch (err) {
      console.warn(`${label}: FAILED — ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nDone. ${filled} of ${candidates.length} file(s) now have text.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
